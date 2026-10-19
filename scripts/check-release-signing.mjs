// SPDX-License-Identifier: MPL-2.0
// Development builds may be unsigned; production release builds fail closed.
if (process.env.DCB_RELEASE === '1') {
  const target = process.argv[2] || process.platform
  const required =
    target === 'darwin'
      ? ['CSC_LINK', 'CSC_KEY_PASSWORD', 'APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID']
      : target === 'win32'
        ? ['CSC_LINK', 'CSC_KEY_PASSWORD']
        : []
  const missing = required.filter((key) => !process.env[key])
  if (missing.length)
    throw new Error(
      'Production release signing is not configured. Set these secret names (never commit values): ' +
        missing.join(', '),
    )
}
