# Main portal trade registration patch

Customer registration must live on **protoportal-main**, not the admin app.

Apply this patch to `danieljoffeinfo-web/Proto-Website-` (main trade portal):

```bash
cd /path/to/Proto-Website-
git apply /path/to/register-on-main-portal.patch
# or copy the files in this folder over the repo root
npm run build
```

After deploy, registration is at:

- https://protoportal-main.vercel.app/register
- https://protoportal-main.vercel.app/pre-register

The admin portal redirects `/register` to that URL.
