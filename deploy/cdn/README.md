# DNI File CDN

DNI Mail can upload public file-sharing attachments to:

`https://cdn.dreadnoughtimperium.org/files/<generated-file-name>`

## Runtime layout

Uploads are written to `public/files/` on the DNI VPS. The mail uploader sends each browser file in 1 MiB chunks, so a single file can be up to 200 MiB without requiring a 200 MiB PHP multipart request.

The Apache configurator adds `cdn.dreadnoughtimperium.org` as a file-only alias. Requests on the CDN hostname outside `/files/` return 404. The files directory disables executable handlers, directory indexes, CGI, and active server/web extensions are stored with a final `.bin` suffix.

## DNS and TLS

Point `cdn.dreadnoughtimperium.org` at the DNI VPS using the DNS provider for `dreadnoughtimperium.org`. The TLS certificate used by the Apache HTTPS virtual host must also include `cdn.dreadnoughtimperium.org`; the main DNI vhost already sends HSTS with `includeSubDomains`.

After the DNS/certificate is ready, rerun the existing Rocky bootstrap so the managed Apache blocks receive the CDN alias and file-only rules:

```bash
sudo bash /opt/dni-terminal/deploy/rocky9/bootstrap-vps.sh
```

No new packages are installed by the bootstrap.

## Classification rule

DNI CDN URLs are public **CL/NON** share links. Do not upload classified material to the CDN. Use the existing DNI Document attachment field for clearance-controlled files.
