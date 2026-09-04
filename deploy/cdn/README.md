# DNI File CDN

DNI Mail can upload public file-sharing attachments to:

`https://cdn.dreadnoughtimperium.org/files/<generated-file-name>`

The public DNI emblem archive also delivers its approved PNG assets from:

`https://cdn.dreadnoughtimperium.org/logos/emblems/<branch>/<emblem-file>.png`

The gallery UI itself remains on the primary site at:

`https://www.dreadnoughtimperium.org/logos/emblems/`

## Runtime layout

Uploads are written to `public/files/` on the DNI VPS. The mail uploader sends each browser file in 1 MiB chunks, so a single file can be up to 200 MiB without requiring a 200 MiB PHP multipart request.

Curated emblem images remain in `public/logos/emblems/`. The CDN hostname serves only `/files/` plus PNG files inside the approved emblem branch folders (`government`, `isb`, `army`, `navy`, `medical`, `engineering`, and `logistics`). The CDN does not serve the emblem gallery HTML or arbitrary site pages.

The Apache configurator adds `cdn.dreadnoughtimperium.org` as a restricted static-file alias. Requests on the CDN hostname outside the approved paths return 404. The files directory disables executable handlers, directory indexes, and CGI; active server/web upload extensions are stored with a final `.bin` suffix. Curated emblem PNG responses are cross-origin readable and use long-lived immutable caching.

## DNS and TLS

Point `cdn.dreadnoughtimperium.org` at the DNI VPS using the DNS provider for `dreadnoughtimperium.org`. The TLS certificate used by the Apache HTTPS virtual host must also include `cdn.dreadnoughtimperium.org`; the main DNI vhost already sends HSTS with `includeSubDomains`.

After the DNS/certificate is ready, rerun the existing Rocky bootstrap so the managed Apache blocks receive the CDN alias and restricted static-file rules:

```bash
sudo bash /opt/dni-terminal/deploy/rocky9/bootstrap-vps.sh
```

No new packages are installed by the bootstrap.

## Classification rule

DNI CDN URLs are public **CL/NON** share links. Do not upload classified material to the CDN. Use the existing DNI Document attachment field for clearance-controlled files.
