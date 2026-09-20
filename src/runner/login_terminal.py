"""Small PTY bridge for the official interactive Gemini login. No shell."""
import os, pty, select, subprocess, sys, termios, fcntl, struct
master, slave = pty.openpty()
fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 40, 4096, 0, 0))
p = subprocess.Popen(sys.argv[1:], stdin=slave, stdout=slave, stderr=slave, close_fds=True)
os.close(slave)
try:
    while p.poll() is None:
        ready, _, _ = select.select([master, 0], [], [], .5)
        for fd in ready:
            try: data = os.read(fd, 65536)
            except OSError: data = b''
            if not data:
                if fd == 0: p.terminate()
                break
            if fd == master:
                # Terminal capability queries must not stall the CLI UI.
                if b'\x1b[6n' in data: os.write(master, b'\x1b[1;1R')
                os.write(1, data)
            else: os.write(master, data)
finally:
    if p.poll() is None: p.terminate()
    os.close(master)
sys.exit(p.wait())
