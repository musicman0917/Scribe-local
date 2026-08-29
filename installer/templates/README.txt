Scribe Local
============

Installed as a Windows Service named "Scribe Local", set to start
automatically with Windows (you do not need to keep a terminal open).

Dashboard: http://localhost:<port>   (default 3000 — see service\port.txt)

Open the dashboard
-------------------
Double-click "Open Scribe Local.bat" in this folder, or use the
Start Menu shortcut (Start Menu > Scribe Local > Open Scribe Local).

Change the port
-----------------
1. Edit service\port.txt to the port number you want (just the number,
   nothing else).
2. Double-click "Restart Service.bat" in this folder.

Logs
-----
app\daemon\  (created after the service has run at least once — contains
the wrapper's stdout/stderr logs, useful for troubleshooting startup
issues).

Uninstall
----------
Use "Add or remove programs" in Windows Settings, or the Start Menu
shortcut: Start Menu > Scribe Local > Uninstall.

--------------------------------------------------------------------
IMPORTANT SECURITY NOTICE

This software is NOT safe or compliant for capturing, storing, or
processing financial data, Protected Health Information (PHI), or any
HIPAA-regulated data. Screenshots are stored unencrypted on this
machine. Always review captured screenshots before exporting, and use
the built-in redaction tool on anything sensitive (passwords, API
keys, stream keys, personal information) before sharing a tutorial.

See app\README.md for full details.
--------------------------------------------------------------------
