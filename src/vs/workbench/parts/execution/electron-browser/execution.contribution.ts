/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import * as env from 'vs/base/common/platform';
import { TPromise } from 'vs/base/common/winjs.base';
import { Registry } from 'vs/platform/registry/common/platform';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { registerSingleton } from 'vs/platform/instantiation/common/extensions';
import paths = require('vs/base/common/paths');
import uri from 'vs/base/common/uri';
import { ITerminalService } from 'vs/workbench/parts/execution/common/execution';
import { MenuId, MenuRegistry } from 'vs/platform/actions/common/actions';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { toResource } from 'vs/workbench/common/editor';
import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { Extensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { ITerminalService as IIntegratedTerminalService, KEYBINDING_CONTEXT_TERMINAL_NOT_FOCUSED } from 'vs/workbench/parts/terminal/common/terminal';
import { DEFAULT_TERMINAL_WINDOWS, DEFAULT_TERMINAL_LINUX_READY, DEFAULT_TERMINAL_OSX, ITerminalConfiguration } from 'vs/workbench/parts/execution/electron-browser/terminal';
import { WinTerminalService, MacTerminalService, LinuxTerminalService } from 'vs/workbench/parts/execution/electron-browser/terminalService';
import { IHistoryService } from 'vs/workbench/services/history/common/history';
import { ResourceContextKey } from 'vs/workbench/common/resources';
import { IExplorerContext } from 'vs/workbench/parts/files/electron-browser/fileActions';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';

if (env.isWindows) {
	registerSingleton(ITerminalService, WinTerminalService);
} else if (env.isMacintosh) {
	registerSingleton(ITerminalService, MacTerminalService);
} else if (env.isLinux) {
	registerSingleton(ITerminalService, LinuxTerminalService);
}

DEFAULT_TERMINAL_LINUX_READY.then(defaultTerminalLinux => {
	let configurationRegistry = <IConfigurationRegistry>Registry.as(Extensions.Configuration);
	configurationRegistry.registerConfiguration({
		'id': 'externalTerminal',
		'order': 100,
		'title': nls.localize('terminalConfigurationTitle', "External Terminal"),
		'type': 'object',
		'properties': {
			'terminal.explorerKind': {
				'type': 'string',
				'enum': [
					'integrated',
					'external'
				],
				'description': nls.localize('explorer.openInTerminalKind', "Customizes what kind of terminal to launch."),
				'default': 'integrated',
				'isExecutable': false
			},
			'terminal.external.windowsExec': {
				'type': 'string',
				'description': nls.localize('terminal.external.windowsExec', "Customizes which terminal to run on Windows."),
				'default': DEFAULT_TERMINAL_WINDOWS,
				'isExecutable': true
			},
			'terminal.external.osxExec': {
				'type': 'string',
				'description': nls.localize('terminal.external.osxExec', "Customizes which terminal application to run on OS X."),
				'default': DEFAULT_TERMINAL_OSX,
				'isExecutable': true
			},
			'terminal.external.linuxExec': {
				'type': 'string',
				'description': nls.localize('terminal.external.linuxExec', "Customizes which terminal to run on Linux."),
				'default': defaultTerminalLinux,
				'isExecutable': true
			}
		}
	});
});

const OPEN_CONSOLE_COMMAND_ID = 'workbench.command.terminal.openNativeConsole';

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: OPEN_CONSOLE_COMMAND_ID,
	primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_C,
	when: KEYBINDING_CONTEXT_TERMINAL_NOT_FOCUSED,
	weight: KeybindingsRegistry.WEIGHT.workbenchContrib(),
	handler: (accessor, resource: uri, context: IExplorerContext) => {
		const configurationService = accessor.get(IConfigurationService);
		const historyService = accessor.get(IHistoryService);
		const editorService = accessor.get(IWorkbenchEditorService);
		let pathToOpen: string;

		// Try workspace path first
		const root = historyService.getLastActiveWorkspaceRoot('file');
		pathToOpen = resource ? resource.fsPath : (root && root.fsPath);
		if (context && context.stat && !context.stat.isDirectory) {
			pathToOpen = context.stat.parent.resource.fsPath;
		}

		// Otherwise check if we have an active file open
		if (!pathToOpen) {
			const file = toResource(editorService.getActiveEditorInput(), { supportSideBySide: true, filter: 'file' });
			if (file) {
				pathToOpen = paths.dirname(file.fsPath); // take parent folder of file
			}
		}

		if (configurationService.getValue<ITerminalConfiguration>().terminal.explorerKind === 'integrated') {
			const integratedTerminalService = accessor.get(IIntegratedTerminalService);

			const instance = integratedTerminalService.createInstance({ cwd: pathToOpen }, true);
			if (instance) {
				integratedTerminalService.setActiveInstance(instance);
				integratedTerminalService.showPanel(true);
			}
		} else {
			const terminalService = accessor.get(ITerminalService);
			terminalService.openTerminal(pathToOpen);
		}

		return TPromise.as(null);
	}
});

const openConsoleCommand = {
	id: OPEN_CONSOLE_COMMAND_ID,
	title: env.isWindows ? nls.localize('scopedConsoleActionWin', "Open in Command Prompt") :
		nls.localize('scopedConsoleActionMacLinux', "Open in Terminal")
};

MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
	command: openConsoleCommand
});

MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
	group: 'navigation',
	order: 30,
	command: openConsoleCommand,
	when: ResourceContextKey.Scheme.isEqualTo('file')
});

MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
	group: 'navigation',
	order: 30,
	command: openConsoleCommand,
	when: ResourceContextKey.Scheme.isEqualTo('file')
});
