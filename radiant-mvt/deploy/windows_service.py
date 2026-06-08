"""
Radiant-MVT Windows Service Wrapper
Runs uvicorn as a Windows service using pywin32.

Install:   python deploy/windows_service.py install
Start:     python deploy/windows_service.py start
Stop:      python deploy/windows_service.py stop
Remove:    python deploy/windows_service.py remove
"""
import sys
import os
import subprocess
import win32serviceutil
import win32service
import win32event
import servicemanager

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class RadiantMVTService(win32serviceutil.ServiceFramework):
    _svc_name_ = "RadiantMVT"
    _svc_display_name_ = "Radiant-MVT Trading Intelligence Platform"
    _svc_description_ = "INEOS Trading & Shipping — AI-powered trading desk platform"

    def __init__(self, args):
        win32serviceutil.ServiceFramework.__init__(self, args)
        self.hWaitStop = win32event.CreateEvent(None, 0, 0, None)
        self.process = None

    def SvcStop(self):
        self.ReportServiceStatus(win32service.SERVICE_STOP_PENDING)
        if self.process:
            self.process.terminate()
        win32event.SetEvent(self.hWaitStop)

    def SvcDoRun(self):
        servicemanager.LogMsg(
            servicemanager.EVENTLOG_INFORMATION_TYPE,
            servicemanager.PYS_SERVICE_STARTED,
            (self._svc_name_, "")
        )
        env_file = os.path.join(BASE_DIR, "radiant-mvt", ".env")
        if os.path.exists(env_file):
            with open(env_file) as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        k, v = line.split("=", 1)
                        os.environ[k.strip()] = v.strip()

        self.process = subprocess.Popen([
            sys.executable, "-m", "uvicorn", "main:app",
            "--host", "0.0.0.0",
            "--port", "8000",
            "--log-level", "info",
            "--access-log",
        ], cwd=os.path.join(BASE_DIR, "radiant-mvt"))

        win32event.WaitForSingleObject(self.hWaitStop, win32event.INFINITE)


if __name__ == "__main__":
    if len(sys.argv) == 1:
        servicemanager.Initialize()
        servicemanager.PrepareToHostSingle(RadiantMVTService)
        servicemanager.StartServiceCtrlDispatcher()
    else:
        win32serviceutil.HandleCommandLine(RadiantMVTService)
