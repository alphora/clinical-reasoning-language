const fs = require('fs');
const path = require('path');

const body = fs.readFileSync(
  path.join(__dirname, '../PULL_REQUEST_TEMPLATE/release.md'),
  'utf8'
);

github.rest.pulls.update({
  owner: context.repo.owner,
  repo: context.repo.repo,
  pull_number: context.issue.number,
  body,
});
