@echo off
:: 设置局部作用域
setlocal

:: 设置控制台标题
title VSCode Dev

:: 记录父路径磁盘位置
pushd %~dp0..

:: Get electron, compile, built-in extensions
:: 如果没有指定跳过预启动环节，则加载预启动脚本
if "%VSCODE_SKIP_PRELAUNCH%"=="" node build/lib/preLaunch.js

:: 获取product.json中nameShort字段的值赋值给环境变量NAMESHORT
for /f "tokens=2 delims=:," %%a in ('findstr /R /C:"\"nameShort\":.*" product.json') do set NAMESHORT=%%~a
:: 去除空格双引号并在后缀拼接 .exe 字符
set NAMESHORT=%NAMESHORT: "=%
set NAMESHORT=%NAMESHORT:"=%.exe
:: 拼接.build/electron/下electron.exe的程序地址
set CODE=".build\electron\%NAMESHORT%"

:: Manage built-in extensions
:: 如果是内建启动，跳转到下面builtin位置执行内建脚本
if "%~1"=="--builtin" goto builtin

:: Configuration
:: 非内建启动下设置环境变量
set ELECTRON_RUN_AS_NODE=1
set NODE_ENV=development
set VSCODE_DEV=1
set ELECTRON_ENABLE_LOGGING=1
set ELECTRON_ENABLE_STACK_DUMPING=1

:: Launch Code
:: 启动electron程序，程序入口在项目根目录（%~dp0..表示当前位置目录的父路径）
:: 启动时指定调试V8的调试协议端口5874，且当做NodeJs进程启动
:: @see https://www.electronjs.org/zh/docs/latest/tutorial/debugging-main-process#--inspectport
:: @see https://www.electronjs.org/zh/docs/latest/api/environment-variables#electron_run_as_node
:: @TODO:CK
%CODE% --inspect=5874 out\cli.js --ms-enable-electron-run-as-node %~dp0.. %*
:: 执行结束
goto end

:: 内建脚本启动
:builtin
%CODE% build/builtin

:end

popd

endlocal
