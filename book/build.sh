#!/usr/bin/env bash
#
# Build the EPUB3 edition of "How Money Moves" from the Markdown chapters.
#
# Requires pandoc (https://pandoc.org/installing.html). Produces
# how-money-moves.epub in this directory with a cover, a working table of
# contents, and one navigable section per chapter — no manual steps.
#
# The CHAPTERS list below is the single source of truth for reading order:
# reorder or insert a chapter by editing this list and nothing else.
#
set -euo pipefail

# Run from the book directory so all paths below are relative to it,
# regardless of where the script is invoked from.
cd "$(dirname "$0")"

OUTPUT="how-money-moves.epub"

CHAPTERS=(
  00-preface.md                       # Front matter (derived from README.md)
  01-what-a-bank-is.md
  02-double-entry-bookkeeping.md
  03-the-chart-of-accounts.md
  04-ledgers-subledgers-and-money.md
  05-transactions-and-postings.md
  06-booking-date-vs-value-date.md
  07-balances-and-holds.md
  08-account-lifecycle-and-overdraft.md
  09-clearing-and-settlement.md
  10-the-interbank-network.md
  11-payment-schemes.md
  12-snapshots-audit-and-statements.md
)

if ! command -v pandoc >/dev/null 2>&1; then
  echo "error: pandoc is not installed. See https://pandoc.org/installing.html" >&2
  exit 1
fi

# gfm-tex_math_dollars: read GitHub-flavored Markdown but disable $...$ math, so
# dollar amounts in the prose (e.g. $10,000) stay literal instead of being
# parsed as TeX math.
pandoc \
  --from=gfm-tex_math_dollars \
  --to=epub3 \
  --toc --toc-depth=1 \
  --split-level=1 \
  --metadata-file=metadata.yaml \
  --css=epub.css \
  --epub-cover-image=img/cover.png \
  --output="$OUTPUT" \
  "${CHAPTERS[@]}"

echo "Wrote $(pwd)/$OUTPUT"
