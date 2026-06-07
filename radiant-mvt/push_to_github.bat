@echo off
echo ============================================================
echo   Pushing Radiant-MVT to GitHub
echo ============================================================

cd /d "%~dp0"

:: Initialize git if not already done
if not exist ".git" (
    echo Initializing git repository...
    git init
)

:: Create .gitignore
echo Creating .gitignore...
(
echo __pycache__/
echo *.pyc
echo *.pyo
echo .env
echo *.db
echo *.log
echo .DS_Store
echo __MACOSX/
echo ~$*
echo *.zip
echo slide-*.jpg
) > .gitignore

echo Staging files...
git add .

echo Committing...
git commit -m "Initial commit: Radiant-MVT Trading Intelligence Platform"

echo Setting up remote...
git remote remove origin 2>nul
git remote add origin https://github.com/Praxcalichesolution/MVTTraderDemo.git

git branch -M main

echo Pushing to GitHub...
git push -u origin main

echo.
echo Done! Check https://github.com/Praxcalichesolution/MVTTraderDemo
pause
