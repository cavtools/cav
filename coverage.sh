#!/usr/bin/env bash
cd "$(dirname "$0")"
set -e

# https://deno.land/manual/testing/coverage
rm -rf cov_profile.lcov cov_profile cov_html
deno test --allow-net --coverage=cov_profile $@
deno coverage --lcov cov_profile > cov_profile.lcov
genhtml -o cov_html cov_profile.lcov # macOS: `brew install lcov`
open cov_html/index.html
