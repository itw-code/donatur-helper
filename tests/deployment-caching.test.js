import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('Task 3: Deployment configuration provides correct caching, MIME protection, and robots indexing rules', () => {
  const headers = fs.readFileSync(path.resolve('_headers'), 'utf8');
  
  // HTML & Script revalidation
  assert.ok(headers.includes('/index.html') && headers.includes('must-revalidate'), 'HTML must require revalidation');
  assert.ok(headers.includes('/\n') || headers.includes('/\r\n'), 'Root path must be configured');
  assert.ok(headers.includes('/version.json') && headers.includes('must-revalidate'), 'version.json must require revalidation');
  
  // Unhashed static asset caching (must-revalidate with ETags to prevent stale browser lock-in)
  assert.ok(headers.includes('/css/*') && headers.includes('must-revalidate'), 'CSS must have must-revalidate cache');
  assert.ok(headers.includes('/js/*') && headers.includes('must-revalidate'), 'JS must have must-revalidate cache');
  assert.ok(headers.includes('/assets/*') && headers.includes('max-age='), 'Assets must have cache configuration');
  
  // Security headers
  assert.ok(headers.includes('X-Content-Type-Options: nosniff'), 'nosniff header must be set');
  assert.ok(headers.includes('X-Frame-Options: SAMEORIGIN'), 'SAMEORIGIN frame header must be set');
  assert.ok(headers.includes('Referrer-Policy: strict-origin-when-cross-origin'), 'Referrer-Policy must be set');
  assert.ok(headers.includes('Permissions-Policy:'), 'Permissions-Policy must be set');

  // Netlify configuration
  const netlifyToml = fs.readFileSync(path.resolve('netlify.toml'), 'utf8');
  assert.ok(netlifyToml.includes('[[redirects]]'), 'Netlify must contain redirects block');
  assert.ok(netlifyToml.includes('[[headers]]'), 'Netlify must contain headers block');
  assert.ok(netlifyToml.includes('X-Content-Type-Options = "nosniff"'), 'Netlify must include nosniff');
  assert.ok(netlifyToml.includes('/css/*') && netlifyToml.includes('must-revalidate'), 'Netlify must declare CSS cache');
  assert.ok(netlifyToml.includes('/js/*') && netlifyToml.includes('must-revalidate'), 'Netlify must declare JS cache');
  
  // Robots indexing
  const robots = fs.readFileSync(path.resolve('robots.txt'), 'utf8');
  assert.ok(robots.includes('User-agent: *'), 'Robots must declare wildcard user-agent');
  assert.ok(robots.includes('Allow: /'), 'Robots must allow root');
  assert.ok(robots.includes('Disallow: /*?token=*'), 'Robots must disallow token queries');
  assert.ok(robots.includes('Disallow: /*#c=*'), 'Robots must disallow deep-dive campaign hashes');
  assert.ok(robots.includes('Disallow: /api/'), 'Robots must disallow api routes');
});
