/**
 * parse/mounts.ts — /proc/self/mountinfo (spec §3.2 row Mounts): per-mount `ro`/`noexec`,
 * super-option `seclabel` and `context=`, octal escapes; the mount a path lives on (S6, §4.3
 * host.noexec, selinux.media_access). Typed fixtures (a container's mountinfo is the VM's).
 */
import { describe, expect, test } from 'bun:test';
import { NETWORK_FS_TYPES, fsTypeOf, isNetworkFs, mountOf, parseMountinfo } from '../src/provision/init/parse/mounts';
import { fixture } from './fixtures/init/load';

const network = parseMountinfo(fixture('typed/mounts/mountinfo_el9_network.txt'));
const cis = parseMountinfo(fixture('typed/mounts/mountinfo_cis.txt'));

describe('parseMountinfo', () => {
  test('xfs root with seclabel; proc noexec', () => {
    expect(network[0]).toEqual({ mountPoint: '/', fsType: 'xfs', readOnly: false, noexec: false, seclabel: true, context: null });
    expect(network[1]).toMatchObject({ mountPoint: '/proc', noexec: true, seclabel: false });
  });

  test('home on nfs4; media on nfs4 read-only; an NFSv4.2 seclabel export', () => {
    expect(network.find(row => row.mountPoint === '/home')).toMatchObject({ fsType: 'nfs4', seclabel: false, readOnly: false });
    expect(network.find(row => row.mountPoint === '/srv/media')).toMatchObject({ fsType: 'nfs4', readOnly: true });
    expect(network.find(row => row.mountPoint === '/srv/labelled')).toMatchObject({ fsType: 'nfs4', seclabel: true });
  });

  test('a context= mount keeps its quoted value whole; the mount point is unescaped (\\040)', () => {
    expect(network.find(row => row.mountPoint === '/srv/web media')).toMatchObject({
      fsType: 'nfs4',
      context: 'system_u:object_r:httpd_sys_content_t:s0',
    });
    const mls = parseMountinfo('50 22 0:51 / /m rw - nfs4 nas:/x rw,context="system_u:object_r:httpd_sys_content_t:s0:c1,c2",vers=4.1\n');
    expect(mls[0]?.context).toBe('system_u:object_r:httpd_sys_content_t:s0:c1,c2');
  });

  test('cifs and fuse.sshfs', () => {
    expect(network.find(row => row.mountPoint === '/mnt/share')?.fsType).toBe('cifs');
    expect(network.find(row => row.mountPoint === '/mnt/sshfs')?.fsType).toBe('fuse.sshfs');
  });

  test('CIS: /home and /var noexec; a mount below /var is not', () => {
    expect(cis.find(row => row.mountPoint === '/home')?.noexec).toBe(true);
    expect(cis.find(row => row.mountPoint === '/var')?.noexec).toBe(true);
    expect(cis.find(row => row.mountPoint === '/var/lib/dedalo_publication_host_init')?.noexec).toBe(false);
    expect(cis.find(row => row.mountPoint === '/opt')?.noexec).toBe(false);
  });

  test('a line without the separator or with too few fields throws; blank lines are skipped', () => {
    expect(() => parseMountinfo('22 1 253:0 / / rw,relatime shared:1 xfs /dev/x rw\n')).toThrow("no '-' separator");
    expect(() => parseMountinfo('22 1 253:0 / / rw - xfs\n')).toThrow('too few fields');
    expect(parseMountinfo('\n\n')).toEqual([]);
  });
});

describe('the mount of a path', () => {
  test('the longest containing mount point, segment-wise', () => {
    expect(fsTypeOf('/home/museum.org', network)).toBe('nfs4');
    expect(fsTypeOf('/homes/x', network)).toBe('xfs');
    expect(mountOf('/srv/media/images/a.jpg', network)?.readOnly).toBe(true);
    expect(fsTypeOf('/', network)).toBe('xfs');
    expect(mountOf('/var/lib/dedalo_publication_host_init/x/stage', cis)?.noexec).toBe(false);
    expect(mountOf('/var/lib/other', cis)?.noexec).toBe(true);
    expect(mountOf('/home', cis)?.mountPoint).toBe('/home');
  });

  test('a later mount stacked on the same point wins; no rows → null', () => {
    const stacked = parseMountinfo(
      '22 1 253:0 / / rw - xfs /dev/a rw\n30 22 253:2 / /home rw - xfs /dev/b rw\n31 22 0:9 / /home rw,noexec - tmpfs tmpfs rw\n',
    );
    expect(mountOf('/home/x', stacked)).toMatchObject({ fsType: 'tmpfs', noexec: true });
    expect(mountOf('/x', [])).toBeNull();
    expect(fsTypeOf('/x', [])).toBeNull();
    expect(mountOf('relative', stacked)).toBeNull();
  });

  test('network filesystems: nfs, nfs4, cifs, smb3, autofs and every fuse.*', () => {
    for (const type of [...NETWORK_FS_TYPES, 'fuse', 'fuse.sshfs', 'fuse.glusterfs']) expect(isNetworkFs(type)).toBe(true);
    // fuseblk (ntfs-3g on a local disk) is local: only `fuse` and `fuse.<sub>` are network.
    for (const type of ['xfs', 'ext4', 'tmpfs', 'btrfs', 'fuseblk']) expect(isNetworkFs(type)).toBe(false);
  });
});
