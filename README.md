# Complex Numbers Review (Algebra 2 Honors)

Student page: `/`    Teacher dashboard: `/admin`

Topics: simplifying powers of i, adding and subtracting, multiplying, dividing by a monomial, dividing by a binomial.
Standard: MA.912.NSO.2.1.

## Deploy (Netlify)
Same steps as the Quiz 1 review app: put this folder's contents in a new GitHub repo, then
Netlify > Add new project > Import an existing project. netlify.toml sets the build settings.

Then add the environment variable `ADMIN_PASSWORD` (scope: Functions) and trigger a redeploy.
Check Project configuration > General > Visitor access is set to Public so students can open it.

## Editing
- Problems and answer checking: `public/js/engine.js`
- Look and feel: `public/css/style.css`
- Period choices: `<select id="period">` in `public/index.html`
