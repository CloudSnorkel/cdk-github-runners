# Contributing to CDK GitHub Runners

Thank you for your interest in contributing to this project! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Integration Tests](#integration-tests)
- [Code Quality Standards](#code-quality-standards)
- [Backward Compatibility](#backward-compatibility)
- [Resource Cleanup](#resource-cleanup)
- [API Design Principles](#api-design-principles)
- [Self-Sustaining Systems](#self-sustaining-systems)
- [Pull Request Process](#pull-request-process)
- [Reporting Issues](#reporting-issues)

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/cdk-github-runners.git`
3. Install dependencies: `yarn install`
4. Create a branch for your changes: `git checkout -b feature/your-feature-name`

## Development Workflow

### Building and Testing

Before submitting a PR, ensure all tests pass:

```bash
# Build the project (automatically runs tests and linting)
yarn build
```

The `yarn build` command automatically runs unit tests and linting. For reference, you can also run these separately:

```bash
# Run unit tests only
yarn test

# Run linting only
yarn eslint
```

### Code Style

- Code is automatically formatted on save (if using VS Code)
- ESLint is automatically run on pull requests
- Follow existing code patterns and conventions
- Use TypeScript best practices
- Keep functions focused and single-purpose
- Add JSDoc comments for public APIs
- Use `@internal` JSDoc tag for APIs that shouldn't be exposed to users

## Integration Tests

**Integration tests are critical** - they validate that the entire system works end-to-end, including GitHub integration and all runner provider types.

### Setting Up Integration Tests

1. **Check if anything changed:**
   ```bash
   # First, verify if the snapshot is still valid
   yarn integ:default:assert
   ```
   If this passes, your changes haven't affected the CloudFormation template and you may not need to deploy. If it fails, proceed to the next step.

2. **Deploy the integration test stack:**
   ```bash
   yarn integ:default:deploy
   ```
   This deploys the test stack defined in `test/default.integ.ts` and captures a snapshot.

3. **Test with the self-hosted workflow:**
   - The integration test creates runners with various providers and labels
   - Use the [`.github/workflows/self-hosted.yml`](.github/workflows/self-hosted.yml) workflow to test against the deployed stack
   - This workflow tests all provider types (CodeBuild, ECS, Lambda, Fargate, EC2) on both Linux and Windows
   - **Important:** If testing on your fork, update the workflow to point to your deployed stack

### Snapshot Management

- Integration tests use CloudFormation template snapshots stored in `test/default.integ.snapshot/`
- If your changes modify the generated CloudFormation template, update the snapshot:
  ```bash
  yarn integ:default:snapshot
  ```
- **Always commit snapshot changes** as part of your PR
- **Always deploy and test** before updating snapshots - don't update snapshots blindly
- In your PR description, mention whether you actually deployed and tested the integration test

### Integration Test Requirements

- All integration test changes must be deployed and tested before merging
- The self-hosted workflow must pass for all provider types
- If adding new providers or features, add corresponding test cases to the self-hosted workflow
- Document any manual testing steps required
- **If you're having issues running integration tests:** Just mention it in your PR description and leave the PR editable by maintainers. A maintainer can likely run the tests for you.

### Manual Testing

Integration tests check the happy paths. We should also test the unhappy paths manually. This is a list of scenarios we should manually test before releasing a new version:

* **Setup page**
  * GitHub app
  * Personal access token
  * GitHub Enterprise Server
* **Idle reaper**
  * Confirm idle runner is stopped automatically
  * Confirm runner doesn't stay registered in GitHub
  * Confirm runner is not retried
  * Step function result is aborted and not failed
* **Retries**
  * Confirm runner errors are retried
  * Confirm failed runner doesn't stay registered in GitHub

The last two scenarios can be tested with the following test cases:

* Start step function without a job actually pending (e.g., by duplicating input from a previous job, or cancelling a job before a runner picks it up)
  * The step function should be aborted as an idle runner
  * No runner should be registered on GitHub at the end
* Let Lambda runner timeout by starting a job that lasts longer than 15 minutes
  * The runner should be retried and eventually the step function should be aborted as an idle runner
  * No runner should be registered on GitHub at the end

## Code Quality Standards

### Testing Requirements

- **Unit tests:** All new features and bug fixes must include unit tests
- **Integration tests:** Changes affecting infrastructure must be tested via integration tests
- **Coverage:** Maintain or improve test coverage
- **Edge cases:** Test both happy paths and error conditions

### Documentation

- Update README.md for user-facing changes
- Add JSDoc comments for all public APIs (API.md is auto-generated from JSDoc comments)
- Update examples if adding new features
- Document breaking changes clearly

## Backward Compatibility

**Backward compatibility is critical** - users depend on stable APIs.

### API Changes

- **Avoid breaking changes** whenever possible
- If breaking changes are necessary:
  - **Discuss with maintainers first** before implementing
  - Deprecate old APIs first with `@deprecated` tags

### Property Changes

- Adding new optional properties is generally safe
- Changing required properties to optional is safe
- Changing optional properties to required is a breaking change
- Removing properties is a breaking change

### Default Behavior

- **Our default behavior should be zero footguns, sane, useful, and usable** - users shouldn't have to dig into docs to avoid breaking things
- Changing default behavior can break users who rely on current defaults
- If changing defaults, document the change clearly and consider making it opt-in initially

### Testing Backward Compatibility

- Integration tests help catch breaking changes
- Consider adding tests that verify old usage patterns still work
- Test with previous versions of dependencies when possible

## Resource Cleanup

**When deleting resources, nothing should stay behind.** This is critical for cost management and security.

### Cleanup Requirements

1. **CloudFormation Custom Resources:**
   - All custom resources must handle `Delete` events properly
   - Delete all associated resources (AMIs, snapshots, ECR images, etc.)
   - Handle cleanup failures gracefully but log them

2. **Image Builders:**
   - Old AMIs and snapshots must be deleted
   - ECR images for old versions must be cleaned up
   - Use lifecycle policies where possible (e.g., Image Builder lifecycle policies)
   - Custom resource handlers should clean up resources on stack deletion

3. **Runner Resources:**
   - Failed runners must be unregistered from GitHub
   - Idle runners must be cleaned up properly
   - No orphaned EC2 instances, ECS tasks, or Lambda functions should remain

4. **Log Groups:**
   - Set appropriate retention policies
   - Use `RemovalPolicy.DESTROY` for all resources

5. **Testing Cleanup:**
   - Verify stack deletion completes successfully
   - Check that no resources remain after `cdk destroy`
   - Test cleanup in integration tests when possible

### Cleanup Patterns

- Use CloudFormation custom resources for complex cleanup logic
- Tag resources consistently to enable lifecycle policies
- Implement idempotent cleanup operations
- Log cleanup operations for debugging

## API Design Principles

### Keep Interfaces Clean and Simple

- **Minimal API surface:** Expose only what's necessary
- **Clear naming:** Use descriptive, consistent names
- **Logical grouping:** Group related functionality together
- **Avoid deep nesting:** Keep construct hierarchies shallow when possible

### Good Defaults

**Users shouldn't have to dig into docs for something sane that doesn't break all the time.**

- **Sensible defaults:** Provide defaults that work for most use cases
- **Zero-configuration:** Simple use cases should work with minimal configuration
- **Progressive disclosure:** Advanced features should be optional
- **Document defaults:** Clearly document what the defaults are and when to change them

### Example: Good Defaults

```typescript
// Good: Works out of the box with sensible defaults
new GitHubRunners(this, 'runners');

// Good: Easy to customize when needed
new GitHubRunners(this, 'runners', {
  providers: [myCustomProvider],
});

// Avoid: Requiring users to configure everything
new GitHubRunners(this, 'runners', {
  providers: [...], // required
  webhookSecret: ..., // required
  // ... many more required properties
});
```

### Interface Design Guidelines

- **Consistency:** Follow existing patterns in the codebase
- **Composability:** Make it easy to combine features
- **Type safety:** Use TypeScript types effectively, but be aware of [jsii limitations](https://aws.github.io/jsii/) when designing APIs that need to work across multiple languages
- **Validation:** Validate inputs early with clear error messages

## Self-Sustaining Systems

**Systems should be self-sustaining** - they should maintain themselves without manual intervention.

### Scheduled Image Builds

- **Image builders should rebuild images on a schedule** to keep runner software and dependencies up-to-date
- Default rebuild interval should be reasonable (e.g., weekly)
- Users should be able to customize the schedule
- Failed builds should be reported (e.g., via SNS topics)

### Automatic Updates

- Runner images should automatically include the latest runner version
- Security patches should be applied automatically
- Dependencies should be kept current

### Monitoring and Alerts

- Provide metrics for failed operations
- Enable SNS topics for critical failures (e.g., failed image builds)
- Make it easy for users to set up alarms

### Example: Self-Sustaining Image Builder

```typescript
// Image builder automatically rebuilds weekly by default
const builder = FargateRunnerProvider.imageBuilder(this, 'builder', {
  rebuildInterval: Duration.days(7), // default
});

// Users can customize the schedule
const customBuilder = FargateRunnerProvider.imageBuilder(this, 'custom-builder', {
  rebuildInterval: Duration.days(1), // daily rebuilds
});
```

## Pull Request Process

**Before starting work on a PR, it's a good idea to discuss your changes in GitHub Discussions first.** This helps ensure your approach aligns with the project's direction and can save time by getting feedback early.

### Before Submitting

1. **Ensure tests pass:**
   ```bash
   yarn build  # automatically runs tests and integ:default:assert
   ```

2. **Update documentation:**
   - README.md for user-facing changes
   - Code comments for API changes
   - Examples if adding new features

3. **Check backward compatibility:**
   - Don't change interfaces without a good reason
   - Verify existing code still works
   - Document any breaking changes

4. **Verify cleanup:**
   - Test that resources are properly cleaned up
   - Ensure no orphaned resources remain

### PR Checklist

- [ ] All tests pass (unit and integration)
- [ ] Code follows project style guidelines
- [ ] Documentation updated
- [ ] Integration test deployed and tested (if applicable)
- [ ] Snapshot updated if CloudFormation template changed
- [ ] Backward compatibility considered
- [ ] Resource cleanup verified
- [ ] Self-hosted workflow tested (if applicable)
- [ ] PR description explains changes and testing performed

### PR Description Template

```markdown
## Description
Brief description of changes

## Testing
- [ ] Unit tests added/updated
- [ ] Integration test deployed and tested
- [ ] Self-hosted workflow tested
- [ ] Manual testing performed (if applicable)

## Breaking Changes
- [ ] No breaking changes
- [ ] Breaking changes documented with migration path

## Cleanup Verified
- [ ] Stack deletion tested
- [ ] No orphaned resources remain
```

### Review Process

- Maintainers will review your PR
- Address feedback promptly
- Allow edits from maintainers for small fixes
- Be responsive to questions and suggestions

## Reporting Issues

### Bug Reports

Include:
- **Description:** Clear description of the issue
- **Steps to reproduce:** Detailed steps to reproduce the bug
- **Expected behavior:** What should happen
- **Actual behavior:** What actually happens
- **Environment:** CDK version, Node version, OS, etc.
- **Logs:** Relevant logs from CloudWatch or local execution
- **Minimal reproduction:** If possible, provide a minimal example

### Feature Requests

Include:
- **Use case:** Describe the problem you're trying to solve
- **Proposed solution:** How you envision the feature working
- **Alternatives considered:** Other approaches you've considered
- **Impact:** Who would benefit from this feature

### Security Issues

**Do not open public issues for security vulnerabilities.** Instead, contact the maintainers directly or use GitHub's security advisory feature.

## Additional Resources

- [API Documentation](API.md) - Generated API documentation
- [Examples](examples/) - Example implementations
- [README](README.md) - Project overview and usage

## Questions?

If you have questions about contributing, feel free to:
- Open a discussion on GitHub
- Ask in your PR comments
- Review existing PRs and issues for examples

Thank you for contributing! 🎉
