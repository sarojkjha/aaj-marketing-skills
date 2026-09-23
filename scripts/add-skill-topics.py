"""
add-skill-topics.py — one-time backfill of the topic taxonomy into SKILL.md frontmatter.

Writes `topic:` (and `secondary_topics:` where there are any) into each skill's
metadata block, using the assignments that already live in the main site's
scripts/hub/hubdata.py. After this, the repo is the source of truth for the
taxonomy and platform/scripts/sync-skills.mjs carries it into the catalog.

Run from the repo root:   py scripts/add-skill-topics.py
Idempotent: a skill that already declares a topic is left alone.
"""
import os
import re
import sys

ASSIGNMENTS = {
    'ab-test-significance':        ('analytics-budget',     ['website-conversion']),
    'agent-readiness-audit':       ('ai-search',            []),
    'brand-product-context':       ('strategy-positioning', ['brand-voice']),
    'brand-voice-governance':      ('brand-voice',          ['content-seo']),
    'campaign-orchestrator':       ('gtm-growth-planning',  ['strategy-positioning']),
    'cold-email-sequence':         ('sales-pipeline',       []),
    'content-calendar-planning':   ('content-seo',          ['social-community']),
    'content-repurposing':         ('content-seo',          ['social-community']),
    'copywriting':                 ('content-seo',          ['website-conversion']),
    'customer-survey-design':      ('audience-research',    []),
    'discovery-call-framework':    ('sales-pipeline',       []),
    'email-lifecycle-sequence':    ('retention-expansion',  []),
    'geo-citation-tracker':        ('ai-search',            []),
    'geo-content-optimization':    ('ai-search',            ['content-seo']),
    'incrementality-and-mmm':      ('analytics-budget',     ['paid-media']),
    'landing-page-brief':          ('website-conversion',   []),
    'lifecycle-and-retention':     ('retention-expansion',  []),
    'marketing-budget-planning':   ('analytics-budget',     ['paid-media']),
    'marketing-loops':             ('gtm-growth-planning',  ['retention-expansion']),
    'marketing-psychology':        ('website-conversion',   ['strategy-positioning']),
    'marketing-report':            ('analytics-budget',     []),
    'messaging-framework':         ('strategy-positioning', ['brand-voice']),
    'objection-handling':          ('sales-pipeline',       ['strategy-positioning']),
    'onboarding-activation':       ('retention-expansion',  ['website-conversion']),
    'paid-media-budget-allocation':('paid-media',           []),
    'persona-builder':             ('audience-research',    []),
    'pipeline-and-forecast':       ('sales-pipeline',       ['analytics-budget']),
    'positioning-statement':       ('strategy-positioning', []),
    'pricing-and-packaging':       ('pricing-monetization', []),
    'programmatic-seo':            ('content-seo',          []),
    'sales-process-design':        ('sales-pipeline',       []),
    'seo-content-brief':           ('content-seo',          ['ai-search']),
    'seo-geo-aeo-audit':           ('ai-search',            ['content-seo']),
    'signup-flow-optimizer':       ('website-conversion',   []),
    'target-account-list':         ('sales-pipeline',       ['audience-research']),
    'unit-economics':              ('analytics-budget',     ['pricing-monetization']),
    'value-proposition':           ('strategy-positioning', ['website-conversion']),
    'website-conversion-audit':    ('website-conversion',   []),
    'win-loss-analysis':           ('sales-pipeline',       []),
}

VALID_TOPICS = {
    'strategy-positioning', 'audience-research', 'pricing-monetization', 'brand-voice',
    'gtm-growth-planning', 'analytics-budget', 'content-seo', 'ai-search', 'paid-media',
    'social-community', 'pr-partnerships-events', 'website-conversion', 'sales-pipeline',
    'retention-expansion', 'ops-ai-team',
}

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKILLS_DIR = os.path.join(REPO_ROOT, 'skills')


def main():
    if not os.path.isdir(SKILLS_DIR):
        print('No skills/ directory beside this script. Run it from the repo root.')
        return 1

    written, skipped, missing = [], [], []

    for slug, (topic, secondary) in sorted(ASSIGNMENTS.items()):
        assert topic in VALID_TOPICS, 'unknown topic %s' % topic
        assert all(s in VALID_TOPICS for s in secondary), 'unknown secondary in %s' % slug

        path = os.path.join(SKILLS_DIR, slug, 'SKILL.md')
        if not os.path.exists(path):
            missing.append(slug)
            continue

        with open(path, 'rb') as f:
            raw = f.read()
        crlf = b'\r\n' in raw
        text = raw.decode('utf-8').replace('\r\n', '\n')

        if '\n  topic:' in text:
            skipped.append(slug)
            continue

        anchor = re.search(r'\n  version: [^\n]*\n', text)
        if not anchor:
            print('  ! %s: no "version:" line in metadata — skipped' % slug)
            skipped.append(slug)
            continue

        block = '  topic: %s\n' % topic
        if secondary:
            block += '  secondary_topics: [%s]\n' % ', '.join(secondary)

        text = text[:anchor.end()] + block + text[anchor.end():]
        if crlf:
            text = text.replace('\n', '\r\n')
        with open(path, 'w', encoding='utf-8', newline='') as f:
            f.write(text)
        written.append(slug)

    print('%d skills updated, %d already had a topic' % (len(written), len(skipped)))
    if missing:
        print('not found in this repo: %s' % ', '.join(missing))
    return 0


if __name__ == '__main__':
    sys.exit(main())
