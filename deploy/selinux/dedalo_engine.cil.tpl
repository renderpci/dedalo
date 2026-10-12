; Dédalo — the host-wide SELinux policy module (terminal installer phase 4).
; WRITTEN AND LOADED BY THE INSTALLER on RHEL-family hosts (host_selinux):
;   semodule -X 400 -i /var/lib/dedalo-install/selinux/dedalo_engine.cil
;   restorecon -F /opt/dedalo/bun/<pin>/bun
; ONE module for every instance on the host (refcounted in
; /var/lib/dedalo-install/instances/); a module of this name that the installer
; did not write is refused, never replaced.
;
; WHY A DOMAIN OF ITS OWN. The web server (httpd_t — nginx and Apache both)
; must connect to the engine's unix socket, and `connectto` is checked against
; the DOMAIN of the process that listens, not the socket file's label
; (httpd_var_run_t, set by fcontext, only grants the write on the file —
; campaign 2 L12). Started from a binary under /opt, the engine would run as
; unconfined_service_t, and a rule naming that domain lets httpd_t reach the
; sockets of EVERY service in it. So the engine gets its own domain and httpd_t
; reaches ONLY that one:
;
;   dedalo_engine_exec_t  the pinned, root-owned runtime /opt/dedalo/bun/<pin>/bun
;                         (the filecon below; restorecon applies it).
;   dedalo_engine_t       what systemd (init_t) starts it as — dedalo-ts@<i>'s
;                         ExecStart (the drop-in names that runtime). Anything
;                         else that runs the same file (the installer's engine
;                         steps from a root shell, a backup script) has no
;                         transition and keeps its own domain.
;
; The engine is NOT confined by this module: dedalo_engine_t carries the
; attributes of unconfined_service_t on EL 10 (measured with seinfo -x), so it
; may do exactly what the engine could do before. Only the web server's reach
; narrows. No boolean is changed; the client and the media are served from
; /srv/dedalo/<i> (httpd_sys_content_t by fcontext).
; stamp: @@STAMP@@
(type dedalo_engine_t)
(type dedalo_engine_exec_t)
(roletype system_r dedalo_engine_t)
(roletype object_r dedalo_engine_exec_t)
; The domain: unconfined_service_t's attribute set.
(typeattributeset domain (dedalo_engine_t))
(typeattributeset unconfined_domain_type (dedalo_engine_t))
(typeattributeset can_change_object_identity (dedalo_engine_t))
(typeattributeset can_load_kernmodule (dedalo_engine_t))
(typeattributeset can_load_policy (dedalo_engine_t))
(typeattributeset can_read_shadow_passwords (dedalo_engine_t))
(typeattributeset can_relabelto_binary_policy (dedalo_engine_t))
(typeattributeset can_relabelto_shadow_passwords (dedalo_engine_t))
(typeattributeset can_setbool (dedalo_engine_t))
(typeattributeset can_setenforce (dedalo_engine_t))
(typeattributeset can_setsecparam (dedalo_engine_t))
(typeattributeset can_write_shadow_passwords (dedalo_engine_t))
(typeattributeset corenet_unconfined_type (dedalo_engine_t))
(typeattributeset corenet_unlabeled_type (dedalo_engine_t))
(typeattributeset dbusd_unconfined (dedalo_engine_t))
(typeattributeset devices_unconfined_type (dedalo_engine_t))
(typeattributeset files_unconfined_type (dedalo_engine_t))
(typeattributeset filesystem_unconfined_type (dedalo_engine_t))
(typeattributeset kern_unconfined (dedalo_engine_t))
(typeattributeset named_filetrans_domain (dedalo_engine_t))
(typeattributeset process_uncond_exempt (dedalo_engine_t))
(typeattributeset selinux_unconfined_type (dedalo_engine_t))
(typeattributeset sepgsql_unconfined_type (dedalo_engine_t))
(typeattributeset storage_unconfined_type (dedalo_engine_t))
(typeattributeset userdom_filetrans_type (dedalo_engine_t))
(typeattributeset x_domain (dedalo_engine_t))
(typeattributeset xserver_unconfined_type (dedalo_engine_t))
; Its own-process rules unconfined_service_t holds by name, the same booleans deciding.
(booleanif deny_execmem (false (allow dedalo_engine_t self (process (execmem)))))
(booleanif selinuxuser_execstack (true (allow dedalo_engine_t self (process (execstack)))))
(booleanif selinuxuser_execheap (true (allow dedalo_engine_t self (process (execheap)))))
; The entry file: a normal executable file type.
(typeattributeset file_type (dedalo_engine_exec_t))
(typeattributeset exec_type (dedalo_engine_exec_t))
(typeattributeset entry_type (dedalo_engine_exec_t))
(typeattributeset non_security_file_type (dedalo_engine_exec_t))
(typeattributeset non_auth_file_type (dedalo_engine_exec_t))
(allow dedalo_engine_t dedalo_engine_exec_t (file (entrypoint execute execute_no_trans getattr ioctl lock map open read)))
; systemd starts it into the domain.
(allow init_t dedalo_engine_exec_t (file (execute getattr ioctl map open read)))
(allow init_t dedalo_engine_t (process (transition siginh rlimitinh noatsecure)))
(allow init_t dedalo_engine_t (process2 (nnp_transition nosuid_transition)))
(typetransition init_t dedalo_engine_exec_t process dedalo_engine_t)
(allow dedalo_engine_t init_t (fd (use)))
(allow dedalo_engine_t init_t (process (sigchld)))
(filecon "/opt/dedalo/bun/[^/]+/bun" file (system_u object_r dedalo_engine_exec_t ((s0) (s0))))
; THE rule this module exists for: the web server reaches the engine, and only the engine.
(allow httpd_t dedalo_engine_t (unix_stream_socket (connectto)))
