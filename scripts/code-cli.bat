@echo off
:: ���þֲ�������
setlocal

:: ���ÿ���̨����
title VSCode Dev

:: ��¼��·������λ��
pushd %~dp0..

:: Get electron, compile, built-in extensions
:: ���û��ָ������Ԥ�������ڣ������Ԥ�����ű�
if "%VSCODE_SKIP_PRELAUNCH%"=="" node build/lib/preLaunch.js

:: ��ȡproduct.json��nameShort�ֶε�ֵ��ֵ����������NAMESHORT
for /f "tokens=2 delims=:," %%a in ('findstr /R /C:"\"nameShort\":.*" product.json') do set NAMESHORT=%%~a
:: ȥ���ո�˫���Ų��ں�׺ƴ�� .exe �ַ�
set NAMESHORT=%NAMESHORT: "=%
set NAMESHORT=%NAMESHORT:"=%.exe
:: ƴ��.build/electron/��electron.exe�ĳ����ַ
set CODE=".build\electron\%NAMESHORT%"

:: Manage built-in extensions
:: ������ڽ���������ת������builtinλ��ִ���ڽ��ű�
if "%~1"=="--builtin" goto builtin

:: Configuration
:: ���ڽ����������û�������
set ELECTRON_RUN_AS_NODE=1
set NODE_ENV=development
set VSCODE_DEV=1
set ELECTRON_ENABLE_LOGGING=1
set ELECTRON_ENABLE_STACK_DUMPING=1

:: Launch Code
:: ����electron���򣬳����������Ŀ��Ŀ¼��%~dp0..��ʾ��ǰλ��Ŀ¼�ĸ�·����
:: ����ʱָ������V8�ĵ���Э��˿�5874���ҵ���NodeJs��������
:: @see https://www.electronjs.org/zh/docs/latest/tutorial/debugging-main-process#--inspectport
:: @see https://www.electronjs.org/zh/docs/latest/api/environment-variables#electron_run_as_node
:: @TODO:CK
%CODE% --inspect=5874 out\cli.js --ms-enable-electron-run-as-node %~dp0.. %*
:: ִ�н���
goto end

:: �ڽ��ű�����
:builtin
%CODE% build/builtin

:end

popd

endlocal
