const body = `
# 📦 Release PR Checklist

_This checklist is for release branches (e.g., \`release/v0.1.0\`)._

## ✅ Checklist

- [ ] Create a release branch (\`release/v<version>\`)
- [ ] Update the CHANGELOG
- [ ] Commit all changes
- [ ] Run the release script
- [ ] Push commits and tags
- [ ] Merge the PR
- [ ] Create and publish GitHub Release

---

## 📦 Distribution: GitHub Releases

This package is distributed via GitHub Releases.

To create a new release:

1. **Create a release branch**  
   Example:

   \`\`\`bash
   git checkout -b release/v0.1.0
   \`\`\`

2. **Generate and update the CHANGELOG**  
   Prompt:
   > "I'm creating a new release v0.1.0. Generate and append to the CHANGELOG based on git commits since the last tag."

3. **Commit all changes**

   \`\`\`bash
   git add .
   git commit -m "Prepare release v0.1.0"
   \`\`\`

4. **Run the automated release script**

   \`\`\`bash
   npm run prepublish:github -- <patch|minor|major|version>
   \`\`\`

   Example:

   \`\`\`bash
   npm run prepublish:github -- minor
   \`\`\`

   This script will:
   - Remove \`dist/\` from \`.gitignore\`
   - Build the project
   - Add and commit \`dist/\`
   - Bump the version and create a Git tag
   - Push commits and tags
   - Restore \`dist/\` to \`.gitignore\` and push final cleanup

5. **Create and merge the Pull Request (PR)**

6. **Publish the GitHub Release**
   - Use the version tag (e.g., \`v0.1.0\`)
   - Generate release notes automatically if needed

---

### ⚠️ Important

- The release script expects a **clean working directory** (no unstaged or uncommitted changes).  
  If your working directory is not clean, the script will exit and prompt you to commit, stash, or discard your changes.

- If a rollback warning is shown (e.g., after a failed release), manual intervention may be required to fully undo changes that were already pushed to the remote repository.  
  Check your git log and tags, and clean up as needed.

---

### 💡 Note

You do **NOT** need to attach a \`.tgz\` file for GitHub-based npm installs.
`;

github.rest.pulls.update({
  owner: context.repo.owner,
  repo: context.repo.repo,
  pull_number: context.issue.number,
  body,
});
