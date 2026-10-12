; Dédalo — the host-wide SELinux policy module (terminal installer phase 4).
; WRITTEN AND LOADED BY THE INSTALLER on RHEL-family hosts (host_selinux):
;   semodule -X 400 -i /var/lib/dedalo-install/selinux/dedalo_engine.cil
; ONE module for every instance on the host (refcounted in
; /var/lib/dedalo-install/instances/); a module of this name that the installer
; did not write is refused, never replaced.
;
; The ONE rule: the web server (httpd_t — nginx and Apache both) may connect to
; the engine's unix socket. The engine runs as unconfined_service_t (a systemd
; service from a binary under /opt), and the socket's file label alone
; (httpd_var_run_t, set by fcontext) does not grant connectto between the two
; domains (campaign 2 L12).
;
; (!) WHAT IT WIDENS: the rule names the DOMAIN, not Dédalo's socket — httpd_t
; may connect to the unix sockets of EVERY unconfined_service_t process on the
; host (any service started from /opt, /usr/local or another unlabelled path),
; not only the engine's. The Review and Done say so. The narrow form — a domain
; of the engine's own (an exec type on /opt/dedalo/bun/*/bun with a transition
; from init_t) and connectto only to it — is not built yet. No other rule or
; boolean is added: the client and the media are served from /srv/dedalo/<i>
; (httpd_sys_content_t by fcontext).
; stamp: @@STAMP@@
(allow httpd_t unconfined_service_t (unix_stream_socket (connectto)))
