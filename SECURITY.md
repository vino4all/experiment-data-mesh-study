# Security Policy

This project is an unauthenticated local research testbed. It is not designed
for deployment on the public Internet or use with sensitive data.

## Supported Use

- Bind services to loopback interfaces only.
- Use synthetic data only.
- Store local passwords in `.env`; never commit that file.
- Keep generated result archives out of the source repository.
- Rebuild and scan container images before each public release.

## Reporting

Report suspected credential exposure or security defects privately to the
repository owner. Do not include real credentials, personal data, or exploit
payloads in a public issue.

