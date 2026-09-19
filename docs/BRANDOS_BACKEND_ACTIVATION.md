# BrandOS backend activation

BrandOS already owns tables such as `public.brands`. BrandCurrent must not run
its original `001`–`020` migrations in `public`, because those migrations would
target incompatible tables. The failed installation was transactional and made
no partial BrandCurrent changes.

Use a dedicated `brandcurrent` schema, expose it in BrandOS's Data API schema
settings, and set `SUPABASE_DB_SCHEMA=brandcurrent` in both Sites and the
processor. The application server already selects this schema through its
Supabase client; browser authentication remains on the normal Auth API.

Before applying the translated BrandCurrent migration set, configure these
Sites secrets:

- `SUPABASE_URL=https://dpuawqxkvmzcdmfagncf.supabase.co`
- `SUPABASE_ANON_KEY` with BrandOS's active publishable key
- `SUPABASE_SERVICE_ROLE_KEY` with BrandOS's server-only key
- `SUPABASE_DB_SCHEMA=brandcurrent`

Do not put a service-role key in browser code, a repository, or a public
environment variable. Email magic links use the publishable key in the browser
and the Supabase Auth service. Google login additionally requires a Google OAuth
client created in the owner's Google Cloud project; a public or scraped key
cannot be used for this.

Set the Auth Site URL and allowed redirect URL to
`https://brandcurrent-marketing.lochanharishwar.chatgpt.site`. Email provider is
enabled by default in Supabase, but production delivery should be tested after
the URL is configured. The current app uses `signInWithOtp`, which sends a magic
link by default.
