:: 从当前行开始不显示命令本身
@echo off

:: 设置局部作用域
setlocal

:: 设置控制台标题
title VSCode Dev

:: 记录项目根路径的位置
:: pushd记录位置，后续执行popd命令时跳转回该位置
:: %~dp0表示脚本文件所在文件目录的位置，\..表示再上一层目录
pushd %~dp0\..

:: Get electron, compile, built-in extensions
:: 预启动
:: 如果变量 VSCODE_SKIP_PRELAUNCH 不存在，执行 node build/lib/preLaunch.js命令
:: 注意：在.vscode/settings.json中配置了files.exclude字段指定不显示的内容
::      因此在vscode中看不到build/lib/preLaunch.js文件，其内容是build/lib/preLaunch.ts编译后的产物
if "%VSCODE_SKIP_PRELAUNCH%"=="" node build/lib/preLaunch.js

:: 从product.json文件中提取nameShort字段的值（Code - OSS），该值实则是electron.exe的名称
:: findstr从product.json文件中提取含有 "nameShort":.* 格式的行
::    /R表示把后面的参数作为表达式使用，/C:"xxx"表示指定的字符串包含的空格不能作为分隔符
:: for循环迭代筛选的行，`delims=:,`按分号或逗号分割字符串，`token=2`提取分割结果的第二项
::    将提取结果赋值给变量a，设置环境变量NAMESHORT的结果为变量a，%%~a中的~表示去掉所有的引号
for /f "tokens=2 delims=:," %%a in ('findstr /R /C:"\"nameShort\":.*" product.json') do set NAMESHORT=%%~a

:: 去除NAMESHORT变量的所有 空格引号 两个字符
set NAMESHORT=%NAMESHORT: "=%
:: 去除NAMESHORT变量的所有引号，并且在后面拼接.exe字符
set NAMESHORT=%NAMESHORT:"=%.exe
:: 拼接CODE变量值为electron的程序路径
set CODE=".build\electron\%NAMESHORT%"

:: Manage built-in extensions
:: 调用code.bat时第一个参数传递的是--builtin则跳转到下面builtin的位置处执行
if "%~1"=="--builtin" goto builtin

:: Configuration
:: 配置环境变量
set NODE_ENV=development
set VSCODE_DEV=1
set VSCODE_CLI=1
set ELECTRON_ENABLE_LOGGING=1
set ELECTRON_ENABLE_STACK_DUMPING=1

:: Launch Code
:: 程序启动的代码
:: 调用electron程序执行根目录下文件，会自动获取package.json中指定的main字段作为启动入口
:: main字段指定的为./out/main，该文件由src/main.js编译而来
%CODE% . %*
goto end

:builtin
%CODE% build/builtin

:end

:: 跳转回pushd记录的位置，即项目根目录
popd

endlocal
