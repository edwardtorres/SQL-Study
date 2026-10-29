# Deploying the Larkspur SQL Desk

The site is served at `https://sql.edwardtorres.dev` from AWS, in `us-east-1`. The repository holds no AWS credential, account
number, budget figure or email address. The templates in `infra/` define the AWS resources, and `.github/workflows/deploy.yml`
publishes the build to them.

## What gets created

| Stack | Template | Region | Creates |
|---|---|---|---|
| `sql-cert` | `infra/sql-cert.yaml` | us-east-1 | An ACM certificate for `sql.edwardtorres.dev`, validated by DNS. |
| `sql-site` | `infra/sql-site.yaml` | us-east-1 | A private S3 bucket, a CloudFront distribution that reads it through Origin Access Control, response headers (including the Content-Security-Policy), a CloudFront Function that picks the precompressed file, a WAF web ACL, a GitHub OIDC deploy role trusted only for `main`, and a monthly budget for the `Project=sql-study` tag. |

Both stacks tag their resources `Project=sql-study`. CloudFormation has no property for a CloudFront pricing plan, so the Free plan is chosen in the console (step 4).

The site stack is separate from the certificate stack so that it does not wait on the DNS record you add while the certificate validates.

## Before you start

- The person deploying the stacks needs permission for CloudFormation, ACM, CloudFront, WAF, S3, IAM and Budgets.
- Free plans are limited to **3 per AWS account**, and that limit cannot be raised. Each plan covers one distribution and one apex domain. Check the CloudFront console for a free slot before step 4 ([flat-rate pricing plan quotas](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/flat-rate-pricing-plan.html)).
- An account can have one GitHub OIDC identity provider for `https://token.actions.githubusercontent.com`. If one already exists, reuse it (step 3).
- Until step 4, the distribution runs on pay-as-you-go pricing, so its web ACL carries a prorated charge for those hours.

## Account checklist

Do these in order.

### 1. Request the certificate

Run this in one terminal. It waits for validation, so leave it running:

```sh
aws cloudformation deploy \
  --stack-name sql-cert \
  --template-file infra/sql-cert.yaml \
  --region us-east-1
```

While it waits, open the ACM console in **us-east-1**, choose the pending certificate for `sql.edwardtorres.dev`, and copy its DNS validation record.

### 2. Add the validation record in Cloudflare

In the `edwardtorres.dev` zone, add the CNAME from ACM, with its proxy status set to **DNS only** (grey cloud). Enter the name without the zone suffix, because Cloudflare adds `edwardtorres.dev` itself. Wait until ACM shows the certificate as **Issued**. The `sql-cert` stack then completes.

### 3. Create the site stack

Read the certificate ARN from the `sql-cert` output:

```sh
aws cloudformation describe-stacks --stack-name sql-cert --region us-east-1 \
  --query "Stacks[0].Outputs[?OutputKey=='CertificateArn'].OutputValue" --output text
```

Deploy `sql-site`. The budget address and limit are supplied here and are never written to the repository:

```sh
aws cloudformation deploy \
  --stack-name sql-site \
  --template-file infra/sql-site.yaml \
  --region us-east-1 \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
    CertificateArn=<certificate ARN from sql-cert> \
    BudgetEmail=<address for budget alerts> \
    BudgetLimitUsd=<monthly limit in US dollars> \
    CreateGitHubOidcProvider=<true or false>
```

- Pass `CreateGitHubOidcProvider=true` only when the account has no GitHub OIDC provider. Then leave `ExistingGitHubOidcProviderArn` out.
- If a provider already exists, pass `CreateGitHubOidcProvider=false ExistingGitHubOidcProviderArn=<ARN>`. Find the ARN under IAM, Identity providers.

The stack takes some time, because CloudFront deploys the distribution. Read its outputs when it completes:

```sh
aws cloudformation describe-stacks --stack-name sql-site --region us-east-1 \
  --query "Stacks[0].Outputs" --output table
```

Keep the outputs. Steps 7 and 8 use `DistributionDomainName`, `SiteBucketName`, `DistributionId` and `DeployRoleArn`.

### 4. Switch the distribution to the Free plan

In the CloudFront console, open **Distributions**, choose the distribution whose comment is "The Larkspur SQL Desk (sql.edwardtorres.dev)", open its pricing plan, choose **Free**, and confirm. The template uses none of the features a plan excludes (for example real-time logs, continuous deployment or field-level encryption), so the plan change should not be blocked. If the console reports an unsupported feature, stop and tell the repository owner which one.

### 5. Confirm the web ACL

On the distribution's **Security** tab, the attached web ACL should be `sql-site-acl`. It has a default Allow action and no rules. A distribution on a pricing plan must keep a web ACL, and it cannot be removed while the distribution stays on a plan.

### 6. Confirm the cost-allocation tag

In Billing and Cost Management, open **Cost allocation tags** and activate `Project`. Until the tag is active, the budget's `user:Project$sql-study` filter sees no cost. Tag data can take up to 24 hours to appear.

### 7. Point the hostname at CloudFront

In the `edwardtorres.dev` zone, add a CNAME named `sql`, with the target set to the `DistributionDomainName` output. Set its proxy status to **DNS only**.

### 8. Set the GitHub variables last

In the repository, open **Settings**, then **Secrets and variables**, then **Actions**, and open the **Variables** tab. Create these repository variables. They are not secrets: they name resources and grant nothing by themselves. The deploy role's trust policy is what limits access.

| Variable | Value |
|---|---|
| `AWS_REGION` | `us-east-1` |
| `AWS_DEPLOY_ROLE_ARN` | the `DeployRoleArn` output |
| `SITE_BUCKET` | the `SiteBucketName` output |
| `CLOUDFRONT_DISTRIBUTION_ID` | the `DistributionId` output |
| `SITE_URL` | `https://sql.edwardtorres.dev` |

The deploy job runs only when `AWS_DEPLOY_ROLE_ARN` is set. Until then, merging to `main` runs the checks and skips the publish, so nothing goes live before the account is ready. That is why this variable is set last.

### 9. First deploy

Run the workflow by hand, or push to `main`. In the Actions tab, open **deploy**, choose **Run workflow**, select `main`, and leave `sha` empty.

- **check** runs lint, the unit tests, the build, the production scan, `cfn-lint` on both templates, and the end-to-end tests in Chromium and WebKit.
- **deploy** uploads the build and invalidates the paths that are not content-hashed.
- **smoke** runs the live header and encoding checks, then the live end-to-end tests. It cannot undo or block the deploy. A failure appears on the run, and the site is already live, so roll back if it is broken.

## Rollback

Run the **deploy** workflow from `main` and set `sha` to the commit to restore. The workflow runs the same checks on that commit and publishes its build only if they pass. If they fail, the live site keeps the current build.

Two things to know:

- Publishing removes assets the restored build does not use. A tab left open on the newer build may need a reload to fetch a chunk it has not loaded yet.
- `index.html`, `sw.js`, the manifest and `404.html` are invalidated at once. The hashed files are immutable and keep their names, so the restored build's files load as usual.

## Teardown

Deleting the site stops the hosting and the charges. The bucket is kept on stack deletion by design (`DeletionPolicy: Retain`), so you empty it and delete it yourself. The order matters:

1. Remove the `AWS_DEPLOY_ROLE_ARN` variable. The deploy job then stops publishing.
2. In the CloudFront console, cancel the distribution's pricing plan. A Free plan cancels immediately. This returns the distribution to pay-as-you-go, which is the only way to release the web ACL, and a distribution on a plan cannot be deleted.
3. Empty the bucket. Versioning is off, so this removes everything:
   `aws s3 rm s3://<SiteBucketName> --recursive --region us-east-1`
4. Delete `sql-site`. CloudFormation disables and deletes the distribution first, which takes a while. If the stack created the GitHub OIDC provider (`CreateGitHubOidcProvider=true`), deleting the stack deletes that provider too. Do that only when no other workflow in the account uses it.
5. Delete the retained bucket: `aws s3api delete-bucket --bucket <SiteBucketName> --region us-east-1`.
6. Delete `sql-cert`. Do this only after `sql-site` is gone, because the distribution uses the certificate.
7. Remove the `sql` CNAME and the ACM validation CNAME from Cloudflare.

The budget is deleted with `sql-site`.

## Checks

- **Offline, no AWS call:** `pipx run cfn-lint==1.37.1 infra/sql-cert.yaml infra/sql-site.yaml`. The check job runs this too.
- **Unit tests:** `tests/infra.test.ts` checks that the template's Content-Security-Policy and CloudFront Function match the app's copies, that the deploy role grants only the four actions it needs, and that its trust names only `main`. `tests/deploy-plan.test.ts` checks content types, cache headers and encodings for each published object.
- **Live, after the account steps:** `SITE_URL=https://sql.edwardtorres.dev node scripts/check-live.mjs dist` sends GET requests only and writes nothing. Then `SITE_URL=https://sql.edwardtorres.dev npx playwright test --project=live` runs the live end-to-end tests at 390 and 1280 px.

## Notes

- The Content-Security-Policy is defined once, in `src/security/csp.ts`. Its `script-src` allows `'wasm-unsafe-eval'` for the PostgreSQL engine and no general `eval`. Its `style-src` allows `'unsafe-inline'`, because CodeMirror injects style elements. No script is inline.
- Files over CloudFront's 10 MB automatic-compression limit (the engine WebAssembly) and files outside its compressible-type list are served from precompressed `.br` and `.gz` siblings. The CloudFront Function serves the sibling the viewer accepts, and the original to a viewer that accepts neither.
