/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/platform/update/common/update.config.contribution';

import { app, dialog } from 'electron';
import { unlinkSync } from 'fs';
import { URI } from 'vs/base/common/uri';
import { coalesce, distinct } from 'vs/base/common/arrays';
import { Promises } from 'vs/base/common/async';
import { toErrorMessage } from 'vs/base/common/errorMessage';
import { ExpectedError, setUnexpectedErrorHandler } from 'vs/base/common/errors';
import { IPathWithLineAndColumn, isValidBasename, parseLineAndColumnAware, sanitizeFilePath } from 'vs/base/common/extpath';
import { once } from 'vs/base/common/functional';
import { getPathLabel, mnemonicButtonLabel } from 'vs/base/common/labels';
import { Schemas } from 'vs/base/common/network';
import { basename, join, resolve } from 'vs/base/common/path';
import { mark } from 'vs/base/common/performance';
import { IProcessEnvironment, isMacintosh, isWindows, OS } from 'vs/base/common/platform';
import { cwd } from 'vs/base/common/process';
import { rtrim, trim } from 'vs/base/common/strings';
import { Promises as FSPromises } from 'vs/base/node/pfs';
import { ProxyChannel } from 'vs/base/parts/ipc/common/ipc';
import { Client as NodeIPCClient } from 'vs/base/parts/ipc/common/ipc.net';
import { connect as nodeIPCConnect, serve as nodeIPCServe, Server as NodeIPCServer, XDG_RUNTIME_DIR } from 'vs/base/parts/ipc/node/ipc.net';
import { CodeApplication } from 'vs/code/electron-main/app';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ConfigurationService } from 'vs/platform/configuration/common/configurationService';
import { IDiagnosticsMainService } from 'vs/platform/diagnostics/electron-main/diagnosticsMainService';
import { DiagnosticsService } from 'vs/platform/diagnostics/node/diagnosticsService';
import { NativeParsedArgs } from 'vs/platform/environment/common/argv';
import { EnvironmentMainService, IEnvironmentMainService } from 'vs/platform/environment/electron-main/environmentMainService';
import { addArg, parseMainProcessArgv } from 'vs/platform/environment/node/argvHelper';
import { createWaitMarkerFileSync } from 'vs/platform/environment/node/wait';
import { IFileService } from 'vs/platform/files/common/files';
import { FileService } from 'vs/platform/files/common/fileService';
import { DiskFileSystemProvider } from 'vs/platform/files/node/diskFileSystemProvider';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { ILaunchMainService } from 'vs/platform/launch/electron-main/launchMainService';
import { ILifecycleMainService, LifecycleMainService } from 'vs/platform/lifecycle/electron-main/lifecycleMainService';
import { BufferLogService } from 'vs/platform/log/common/bufferLog';
import { ConsoleMainLogger, getLogLevel, ILoggerService, ILogService, MultiplexLogService } from 'vs/platform/log/common/log';
import { LoggerService } from 'vs/platform/log/node/loggerService';
import product from 'vs/platform/product/common/product';
import { IProductService } from 'vs/platform/product/common/productService';
import { IProtocolMainService } from 'vs/platform/protocol/electron-main/protocol';
import { ProtocolMainService } from 'vs/platform/protocol/electron-main/protocolMainService';
import { ITunnelService } from 'vs/platform/tunnel/common/tunnel';
import { TunnelService } from 'vs/platform/tunnel/node/tunnelService';
import { IRequestService } from 'vs/platform/request/common/request';
import { RequestMainService } from 'vs/platform/request/electron-main/requestMainService';
import { ISignService } from 'vs/platform/sign/common/sign';
import { SignService } from 'vs/platform/sign/node/signService';
import { IStateMainService } from 'vs/platform/state/electron-main/state';
import { StateMainService } from 'vs/platform/state/electron-main/stateMainService';
import { NullTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';
import { IThemeMainService, ThemeMainService } from 'vs/platform/theme/electron-main/themeMainService';
import { IUserDataProfilesMainService, UserDataProfilesMainService } from 'vs/platform/userDataProfile/electron-main/userDataProfile';
import { IPolicyService, NullPolicyService } from 'vs/platform/policy/common/policy';
import { NativePolicyService } from 'vs/platform/policy/node/nativePolicyService';
import { FilePolicyService } from 'vs/platform/policy/common/filePolicyService';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { UriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentityService';
import { PROFILES_ENABLEMENT_CONFIG } from 'vs/platform/userDataProfile/common/userDataProfile';

/**
 * The main VS Code entry point.
 * 真正的主进程逻辑
 *
 * Note: This class can exist more than once for example when VS Code is already
 * running and a second instance is started from the command line. It will always
 * try to communicate with an existing instance to prevent that 2 VS Code instances
 * are running at the same time.
 */
class CodeMain {

	main(): void {
		try {
			// 调用startup方法启动程序
			this.startup();
		} catch (error) {
			console.error(error.message);
			// 出现异常退出程序
			app.exit(1);
		}
	}

	private async startup(): Promise<void> {

		// Set the error handler early enough so that we are not getting the
		// default electron error dialog popping up
		// 尽早初始化未知错误处理程序，避免electron主进程错误弹窗
		// 这里将未知错误处理程序设置成console.error
		setUnexpectedErrorHandler(err => console.error(err));

		// Create services
		// 创建所有服务
		const [instantiationService, instanceEnvironment, environmentMainService, configurationService, stateMainService, bufferLogService, productService, userDataProfilesMainService] = this.createServices();

		try {

			// Init services
			try {
				await this.initServices(environmentMainService, userDataProfilesMainService, configurationService, stateMainService, productService);
			} catch (error) {

				// Show a dialog for errors that can be resolved by the user
				// 处理可以由用户解决的错误弹窗
				this.handleStartupDataDirError(environmentMainService, productService.nameLong, error);

				throw error;
			}

			// Startup
			// 启动
			// instantiationService.invokeFunction()调用后立即执行内部函数 async accessor => {}
			// async accessor => {} 内部可以通过accessor获取所有的服务
			// await 等待的是 async accessor => {} 的调用结果
			await instantiationService.invokeFunction(async accessor => {
				// 获取多级日志服务，主进程输出日志调用的是logService
				const logService = accessor.get(ILogService);
				const lifecycleMainService = accessor.get(ILifecycleMainService);
				const fileService = accessor.get(IFileService);
				const loggerService = accessor.get(ILoggerService);

				// Create the main IPC server by trying to be the server
				// If this throws an error it means we are not the first
				// instance of VS Code running and so we would quit.
				const mainProcessNodeIpcServer = await this.claimInstance(logService, environmentMainService, lifecycleMainService, instantiationService, productService, true);

				// Write a lockfile to indicate an instance is running (https://github.com/microsoft/vscode/issues/127861#issuecomment-877417451)
				FSPromises.writeFile(environmentMainService.mainLockfile, String(process.pid)).catch(err => {
					logService.warn(`Error writing main lockfile: ${err.stack}`);
				});

				// Delay creation of spdlog for perf reasons (https://github.com/microsoft/vscode/issues/72906)
				// 考虑到性能问题，延迟创建spdlog进行日志输出
				// loggerService.createLogger会初始化spdlog库作为日志器，指定日志器后会立即IO输出bufferLogService缓存的日志数据
				// 另外说明：
				// - 主进程的日志服务是一个多级日志服务，第一个服务是主进程控制台日志输出服务，第二个服务是一个尚未指定日志器的BufferLog服务
				// - 在此指定日志器之前，调用主进程的日志服务只会有主进程控制台日志服务进行输出，而BufferLog服务则会缓存日志数据
				// - 直到下面直到logger之后会立即输出所有缓存的日志数据，
				// - logger指定完成后，后续调用日志服务时BufferLog会立即输出日志
				bufferLogService.logger = loggerService.createLogger(URI.file(join(environmentMainService.logsPath, 'main.log')), { name: 'main' });

				// Lifecycle
				once(lifecycleMainService.onWillShutdown)(evt => {
					fileService.dispose();
					configurationService.dispose();
					evt.join(FSPromises.unlink(environmentMainService.mainLockfile).catch(() => { /* ignored */ }));
				});

				// 实例化CodeApplication并且调用实例的startup方法
				return instantiationService.createInstance(CodeApplication, mainProcessNodeIpcServer, instanceEnvironment).startup();
			});
		} catch (error) {
			instantiationService.invokeFunction(this.quit, error);
		}
	}

	/**
	 * 创建服务
	 * @returns
	 */
	private createServices(): [IInstantiationService, IProcessEnvironment, IEnvironmentMainService, ConfigurationService, StateMainService, BufferLogService, IProductService, UserDataProfilesMainService] {
		// 初始化服务映射表
		const services = new ServiceCollection();
		// 初始化disposables对象集合
		const disposables = new DisposableStore();
		// 进程退出时销毁所有disposables，防止泄露
		process.once('exit', () => disposables.dispose());

		// Product
		const productService = { _serviceBrand: undefined, ...product };
		services.set(IProductService, productService);

		// Environment
		const environmentMainService = new EnvironmentMainService(this.resolveArgs(), productService);
		const instanceEnvironment = this.patchEnvironment(environmentMainService); // Patch `process.env` with the instance's environment
		services.set(IEnvironmentMainService, environmentMainService);

		// Log: We need to buffer the spdlog logs until we are sure
		// we are the only instance running, otherwise we'll have concurrent
		// log file access on Windows (https://github.com/microsoft/vscode/issues/41218)
		// 初始化后的bufferLogService服务，在设置bufferLogService.logger之前，日志都存在缓存区
		// 设置bufferLogService.logger之后，会立即消费缓存区日志数据进行输出
		const bufferLogService = new BufferLogService();
		// 创建多重日志服务
		// 传递给MultiplexLogService的所有日志服务都会依次进行输出
		const logService = disposables.add(new MultiplexLogService([new ConsoleMainLogger(getLogLevel(environmentMainService)), bufferLogService]));
		// 注册多重日志服务
		services.set(ILogService, logService);

		// Files
		// 文件服务
		const fileService = new FileService(logService);
		services.set(IFileService, fileService);
		// 向文件服务注册Provider
		const diskFileSystemProvider = new DiskFileSystemProvider(logService);
		fileService.registerProvider(Schemas.file, diskFileSystemProvider);

		// URI Identity
		const uriIdentityService = new UriIdentityService(fileService);
		services.set(IUriIdentityService, uriIdentityService);

		// Logger
		// 注册主进程文件日志服务（将日志输出到文件系统）
		services.set(ILoggerService, new LoggerService(logService));

		// State
		// 应用状态服务
		const stateMainService = new StateMainService(environmentMainService, logService, fileService);
		services.set(IStateMainService, stateMainService);

		// User Data Profiles
		const userDataProfilesMainService = new UserDataProfilesMainService(stateMainService, uriIdentityService, environmentMainService, fileService, logService);
		services.set(IUserDataProfilesMainService, userDataProfilesMainService);

		// Policy
		const policyService = isWindows && productService.win32RegValueName ? disposables.add(new NativePolicyService(logService, productService.win32RegValueName))
			: environmentMainService.policyFile ? disposables.add(new FilePolicyService(environmentMainService.policyFile, fileService, logService))
				: new NullPolicyService();
		services.set(IPolicyService, policyService);

		// Configuration
		const configurationService = new ConfigurationService(userDataProfilesMainService.defaultProfile.settingsResource, fileService, policyService, logService);
		services.set(IConfigurationService, configurationService);

		// Lifecycle
		services.set(ILifecycleMainService, new SyncDescriptor(LifecycleMainService, undefined, false));

		// Request
		services.set(IRequestService, new SyncDescriptor(RequestMainService, undefined, true));

		// Themes
		services.set(IThemeMainService, new SyncDescriptor(ThemeMainService));

		// Signing
		services.set(ISignService, new SyncDescriptor(SignService, undefined, false /* proxied to other processes */));

		// Tunnel
		services.set(ITunnelService, new SyncDescriptor(TunnelService));

		// Protocol (instantiated early and not using sync descriptor for security reasons)
		services.set(IProtocolMainService, new ProtocolMainService(environmentMainService, userDataProfilesMainService, logService));

		/**
		 * new InstantiationService(services, true) 创建一个services的引用服务，控制其服务的访问以及实例化等逻辑
		 */
		return [new InstantiationService(services, true), instanceEnvironment, environmentMainService, configurationService, stateMainService, bufferLogService, productService, userDataProfilesMainService];
	}

	private patchEnvironment(environmentMainService: IEnvironmentMainService): IProcessEnvironment {
		const instanceEnvironment: IProcessEnvironment = {
			VSCODE_IPC_HOOK: environmentMainService.mainIPCHandle
		};

		['VSCODE_NLS_CONFIG', 'VSCODE_PORTABLE'].forEach(key => {
			const value = process.env[key];
			if (typeof value === 'string') {
				instanceEnvironment[key] = value;
			}
		});

		Object.assign(process.env, instanceEnvironment);

		return instanceEnvironment;
	}

	private async initServices(environmentMainService: IEnvironmentMainService, userDataProfilesMainService: UserDataProfilesMainService, configurationService: ConfigurationService, stateMainService: StateMainService, productService: IProductService): Promise<void> {
		await Promises.settled<unknown>([

			// Environment service (paths)
			// 确保环境服务中的各个文件夹存在，不存在则创建
			Promise.all<string | undefined>([
				environmentMainService.extensionsPath,
				environmentMainService.codeCachePath,
				environmentMainService.logsPath,
				userDataProfilesMainService.defaultProfile.globalStorageHome.fsPath,
				environmentMainService.workspaceStorageHome.fsPath,
				environmentMainService.localHistoryHome.fsPath,
				environmentMainService.backupHome
			].map(path => path ? FSPromises.mkdir(path, { recursive: true }) : undefined)),

			// State service
			// 初始化应用状态服务
			stateMainService.init(),

			// Configuration service
			configurationService.initialize()
		]);

		userDataProfilesMainService.setEnablement(productService.quality !== 'stable' || configurationService.getValue(PROFILES_ENABLEMENT_CONFIG));
	}

	private async claimInstance(logService: ILogService, environmentMainService: IEnvironmentMainService, lifecycleMainService: ILifecycleMainService, instantiationService: IInstantiationService, productService: IProductService, retry: boolean): Promise<NodeIPCServer> {

		// Try to setup a server for running. If that succeeds it means
		// we are the first instance to startup. Otherwise it is likely
		// that another instance is already running.
		// 尝试启动一个服务器，如果启动成功则意味为启动的第一个示例，
		// 否则，可能已经存在另一个实例的服务已经在运行了
		let mainProcessNodeIpcServer: NodeIPCServer;
		try {
			mark('code/willStartMainServer');
			// 启动NodeIPCServer
			mainProcessNodeIpcServer = await nodeIPCServe(environmentMainService.mainIPCHandle);
			mark('code/didStartMainServer');
			once(lifecycleMainService.onWillShutdown)(() => mainProcessNodeIpcServer.dispose());
		} catch (error) {

			// Handle unexpected errors (the only expected error is EADDRINUSE that
			// indicates another instance of VS Code is running)
			// 唯一的一个预期错误，另一个VSCODE已经运行了
			if (error.code !== 'EADDRINUSE') {

				// Show a dialog for errors that can be resolved by the user
				this.handleStartupDataDirError(environmentMainService, productService.nameLong, error);

				// Any other runtime error is just printed to the console
				throw error;
			}

			// there's a running instance, let's connect to it
			let client: NodeIPCClient<string>;
			try {
				// 尝试创建一个NodeIPCClient连接到NodeIPCServer
				client = await nodeIPCConnect(environmentMainService.mainIPCHandle, 'main');
			} catch (error) {

				// Handle unexpected connection errors by showing a dialog to the user
				if (!retry || isWindows || error.code !== 'ECONNREFUSED') {
					if (error.code === 'EPERM') {
						this.showStartupWarningDialog(
							localize('secondInstanceAdmin', "Another instance of {0} is already running as administrator.", productService.nameShort),
							localize('secondInstanceAdminDetail', "Please close the other instance and try again."),
							productService.nameLong
						);
					}

					throw error;
				}

				// it happens on Linux and OS X that the pipe is left behind
				// let's delete it, since we can't connect to it and then
				// retry the whole thing
				try {
					unlinkSync(environmentMainService.mainIPCHandle);
				} catch (error) {
					logService.warn('Could not delete obsolete instance handle', error);

					throw error;
				}

				return this.claimInstance(logService, environmentMainService, lifecycleMainService, instantiationService, productService, false);
			}

			// Tests from CLI require to be the only instance currently
			if (environmentMainService.extensionTestsLocationURI && !environmentMainService.debugExtensionHost.break) {
				const msg = `Running extension tests from the command line is currently only supported if no other instance of ${productService.nameShort} is running.`;
				logService.error(msg);
				client.dispose();

				throw new Error(msg);
			}

			// Show a warning dialog after some timeout if it takes long to talk to the other instance
			// Skip this if we are running with --wait where it is expected that we wait for a while.
			// Also skip when gathering diagnostics (--status) which can take a longer time.
			let startupWarningDialogHandle: NodeJS.Timeout | undefined = undefined;
			if (!environmentMainService.args.wait && !environmentMainService.args.status) {
				startupWarningDialogHandle = setTimeout(() => {
					this.showStartupWarningDialog(
						localize('secondInstanceNoResponse', "Another instance of {0} is running but not responding", productService.nameShort),
						localize('secondInstanceNoResponseDetail', "Please close all other instances and try again."),
						productService.nameLong
					);
				}, 10000);
			}

			const otherInstanceLaunchMainService = ProxyChannel.toService<ILaunchMainService>(client.getChannel('launch'), { disableMarshalling: true });
			const otherInstanceDiagnosticsMainService = ProxyChannel.toService<IDiagnosticsMainService>(client.getChannel('diagnostics'), { disableMarshalling: true });

			// Process Info
			if (environmentMainService.args.status) {
				return instantiationService.invokeFunction(async () => {
					const diagnosticsService = new DiagnosticsService(NullTelemetryService, productService);
					const mainDiagnostics = await otherInstanceDiagnosticsMainService.getMainDiagnostics();
					const remoteDiagnostics = await otherInstanceDiagnosticsMainService.getRemoteDiagnostics({ includeProcesses: true, includeWorkspaceMetadata: true });
					const diagnostics = await diagnosticsService.getDiagnostics(mainDiagnostics, remoteDiagnostics);
					console.log(diagnostics);

					throw new ExpectedError();
				});
			}

			// Windows: allow to set foreground
			if (isWindows) {
				await this.windowsAllowSetForegroundWindow(otherInstanceLaunchMainService, logService);
			}

			// Send environment over...
			logService.trace('Sending env to running instance...');
			await otherInstanceLaunchMainService.start(environmentMainService.args, process.env as IProcessEnvironment);

			// Cleanup
			client.dispose();

			// Now that we started, make sure the warning dialog is prevented
			if (startupWarningDialogHandle) {
				clearTimeout(startupWarningDialogHandle);
			}

			throw new ExpectedError('Sent env to running instance. Terminating...');
		}

		// Print --status usage info
		if (environmentMainService.args.status) {
			logService.warn(`Warning: The --status argument can only be used if ${productService.nameShort} is already running. Please run it again after {0} has started.`);

			throw new ExpectedError('Terminating...');
		}

		// Set the VSCODE_PID variable here when we are sure we are the first
		// instance to startup. Otherwise we would wrongly overwrite the PID
		process.env['VSCODE_PID'] = String(process.pid);

		return mainProcessNodeIpcServer;
	}

	// 处理启动程序时用户数据目录权限相关错误
	private handleStartupDataDirError(environmentMainService: IEnvironmentMainService, title: string, error: NodeJS.ErrnoException): void {
		if (error.code === 'EACCES' || error.code === 'EPERM') {
			const directories = coalesce([environmentMainService.userDataPath, environmentMainService.extensionsPath, XDG_RUNTIME_DIR]).map(folder => getPathLabel(URI.file(folder), { os: OS, tildify: environmentMainService }));

			this.showStartupWarningDialog(
				localize('startupDataDirError', "Unable to write program user data."),
				localize('startupUserDataAndExtensionsDirErrorDetail', "{0}\n\nPlease make sure the following directories are writeable:\n\n{1}", toErrorMessage(error), directories.join('\n')),
				title
			);
		}
	}

	// 展示启动警告弹窗
	private showStartupWarningDialog(message: string, detail: string, title: string): void {
		// use sync variant here because we likely exit after this method
		// due to startup issues and otherwise the dialog seems to disappear
		// https://github.com/microsoft/vscode/issues/104493
		dialog.showMessageBoxSync({
			title,
			type: 'warning',
			buttons: [mnemonicButtonLabel(localize({ key: 'close', comment: ['&& denotes a mnemonic'] }, "&&Close"))],
			message,
			detail,
			defaultId: 0,
			noLink: true
		});
	}

	private async windowsAllowSetForegroundWindow(launchMainService: ILaunchMainService, logService: ILogService): Promise<void> {
		if (isWindows) {
			const processId = await launchMainService.getMainProcessId();

			logService.trace('Sending some foreground love to the running instance:', processId);

			try {
				(await import('windows-foreground-love')).allowSetForegroundWindow(processId);
			} catch (error) {
				logService.error(error);
			}
		}
	}

	private quit(accessor: ServicesAccessor, reason?: ExpectedError | Error): void {
		const logService = accessor.get(ILogService);
		const lifecycleMainService = accessor.get(ILifecycleMainService);

		let exitCode = 0;

		if (reason) {
			if ((reason as ExpectedError).isExpected) {
				if (reason.message) {
					logService.trace(reason.message);
				}
			} else {
				exitCode = 1; // signal error to the outside

				if (reason.stack) {
					logService.error(reason.stack);
				} else {
					logService.error(`Startup error: ${reason.toString()}`);
				}
			}
		}

		lifecycleMainService.kill(exitCode);
	}

	//#region Command line arguments utilities

	private resolveArgs(): NativeParsedArgs {

		// Parse arguments
		const args = this.validatePaths(parseMainProcessArgv(process.argv));

		// If we are started with --wait create a random temporary file
		// and pass it over to the starting instance. We can use this file
		// to wait for it to be deleted to monitor that the edited file
		// is closed and then exit the waiting process.
		//
		// Note: we are not doing this if the wait marker has been already
		// added as argument. This can happen if VS Code was started from CLI.

		if (args.wait && !args.waitMarkerFilePath) {
			const waitMarkerFilePath = createWaitMarkerFileSync(args.verbose);
			if (waitMarkerFilePath) {
				addArg(process.argv, '--waitMarkerFilePath', waitMarkerFilePath);
				args.waitMarkerFilePath = waitMarkerFilePath;
			}
		}

		return args;
	}

	private validatePaths(args: NativeParsedArgs): NativeParsedArgs {

		// Track URLs if they're going to be used
		if (args['open-url']) {
			args._urls = args._;
			args._ = [];
		}

		// Normalize paths and watch out for goto line mode
		if (!args['remote']) {
			const paths = this.doValidatePaths(args._, args.goto);
			args._ = paths;
		}

		return args;
	}

	private doValidatePaths(args: string[], gotoLineMode?: boolean): string[] {
		const currentWorkingDir = cwd();
		const result = args.map(arg => {
			let pathCandidate = String(arg);

			let parsedPath: IPathWithLineAndColumn | undefined = undefined;
			if (gotoLineMode) {
				parsedPath = parseLineAndColumnAware(pathCandidate);
				pathCandidate = parsedPath.path;
			}

			if (pathCandidate) {
				pathCandidate = this.preparePath(currentWorkingDir, pathCandidate);
			}

			const sanitizedFilePath = sanitizeFilePath(pathCandidate, currentWorkingDir);

			const filePathBasename = basename(sanitizedFilePath);
			if (filePathBasename /* can be empty if code is opened on root */ && !isValidBasename(filePathBasename)) {
				return null; // do not allow invalid file names
			}

			if (gotoLineMode && parsedPath) {
				parsedPath.path = sanitizedFilePath;

				return this.toPath(parsedPath);
			}

			return sanitizedFilePath;
		});

		const caseInsensitive = isWindows || isMacintosh;
		const distinctPaths = distinct(result, path => path && caseInsensitive ? path.toLowerCase() : (path || ''));

		return coalesce(distinctPaths);
	}

	private preparePath(cwd: string, path: string): string {

		// Trim trailing quotes
		if (isWindows) {
			path = rtrim(path, '"'); // https://github.com/microsoft/vscode/issues/1498
		}

		// Trim whitespaces
		path = trim(trim(path, ' '), '\t');

		if (isWindows) {

			// Resolve the path against cwd if it is relative
			path = resolve(cwd, path);

			// Trim trailing '.' chars on Windows to prevent invalid file names
			path = rtrim(path, '.');
		}

		return path;
	}

	private toPath(pathWithLineAndCol: IPathWithLineAndColumn): string {
		const segments = [pathWithLineAndCol.path];

		if (typeof pathWithLineAndCol.line === 'number') {
			segments.push(String(pathWithLineAndCol.line));
		}

		if (typeof pathWithLineAndCol.column === 'number') {
			segments.push(String(pathWithLineAndCol.column));
		}

		return segments.join(':');
	}

	//#endregion
}

// Main Startup
// 调用
const code = new CodeMain();
code.main();
