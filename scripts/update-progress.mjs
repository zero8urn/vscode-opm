#!/usr/bin/env node
/* eslint-disable */

/**
 * Progress Update Script for Agile Documentation
 *
 * Automatically calculates and updates progress fields in epic and feature
 * markdown documents based on child document statuses.
 *
 * Usage:
 *   node scripts/update-progress.mjs
 *   npm run update-progress
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DOCS_DIR = path.join(__dirname, '..', 'docs');

// Status values
const STATUS = {
  NOT_STARTED: 'Not Started',
  IN_PROGRESS: 'In Progress',
  DONE: 'Done',
};

/**
 * Parse a markdown file and extract metadata
 */
async function parseMarkdownFile(filePath) {
  const content = await fs.readFile(filePath, 'utf-8');
  const lines = content.split('\n');

  // Extract status from header
  const statusLine = lines.find((line) => line.startsWith('**Status**:'));
  let status = STATUS.NOT_STARTED;

  if (statusLine) {
    if (statusLine.includes(STATUS.DONE)) status = STATUS.DONE;
    else if (statusLine.includes(STATUS.IN_PROGRESS)) status = STATUS.IN_PROGRESS;
  }

  // Extract ID from first heading
  const headingLine = lines.find((line) => line.startsWith('# '));
  const id = headingLine ? headingLine.replace('# ', '').trim() : null;

  return { id, status, content, filePath };
}

/**
 * Get all markdown files in a directory
 */
async function getMarkdownFiles(dir) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const files = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
      .map((entry) => path.join(dir, entry.name));
    return files;
  } catch (error) {
    // Directory doesn't exist
    return [];
  }
}

/**
 * Calculate progress for a collection of items
 */
function calculateProgress(items) {
  const total = items.length;
  const completed = items.filter((item) => item.status === STATUS.DONE).length;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  return {
    completed,
    total,
    percentage,
    status: completed === total && total > 0 ? STATUS.DONE : completed > 0 ? STATUS.IN_PROGRESS : STATUS.NOT_STARTED,
  };
}

/**
 * Update progress fields in a markdown document
 */
function updateProgressInContent(content, progress, type) {
  let updated = content;

  // Update progress line
  const progressRegex = /\*\*Progress\*\*:\s*\d+\/\d+[^(]*\(\d+%\)/;
  const newProgress = `**Progress**: ${progress.completed}/${progress.total} ${type} completed (${progress.percentage}%)`;

  if (progressRegex.test(updated)) {
    updated = updated.replace(progressRegex, newProgress);
  }

  // Update status if all children are done
  if (progress.status === STATUS.DONE) {
    const statusRegex = /\*\*Status\*\*:\s*[^\n]+/;
    updated = updated.replace(statusRegex, `**Status**: ${STATUS.DONE}`);
  }

  // Update Last Updated date
  const today = new Date().toISOString().split('T')[0];
  const lastUpdatedRegex = /\*\*Last Updated\*\*:\s*\d{4}-\d{2}-\d{2}/;

  if (lastUpdatedRegex.test(updated)) {
    updated = updated.replace(lastUpdatedRegex, `**Last Updated**: ${today}`);
  }

  return updated;
}

/**
 * Extract child IDs from table in parent document
 */
function extractChildIds(content, type) {
  const regex = type === 'feature' ? /\|\s*(FEAT-\d{3}-\d{2})/g : /\|\s*(STORY-\d{3}-\d{2}-\d{3})/g;

  const matches = content.matchAll(regex);
  const ids = new Set();

  for (const match of matches) {
    ids.add(match[1]);
  }

  return Array.from(ids);
}

/**
 * Main execution
 */
async function main() {
  console.log('🔄 Updating progress for agile documentation...\n');
  
  try {
    // Parse all stories
    const storyFiles = await getMarkdownFiles(path.join(DOCS_DIR, 'stories'));
    const stories = await Promise.all(storyFiles.map(parseMarkdownFile));
    const storyMap = new Map(stories.map((s) => [s.id, s]));

    console.log(`📝 Found ${stories.length} user stories`);

    // Parse all features
    const featureFiles = await getMarkdownFiles(path.join(DOCS_DIR, 'features'));
    const features = await Promise.all(featureFiles.map(parseMarkdownFile));
    const featureMap = new Map(features.map((f) => [f.id, f]));

    console.log(`📋 Found ${features.length} features`);

    // Parse all epics
    const epicFiles = await getMarkdownFiles(path.join(DOCS_DIR, 'epics'));
    const epics = await Promise.all(epicFiles.map(parseMarkdownFile));

    console.log(`🎯 Found ${epics.length} epics\n`);

    let updatedCount = 0;

    // Update features based on stories
    for (const feature of features) {
      const childStoryIds = extractChildIds(feature.content, 'story');
      const childStories = childStoryIds.map((id) => storyMap.get(id)).filter(Boolean);

      if (childStories.length > 0) {
        const progress = calculateProgress(childStories);
        const updatedContent = updateProgressInContent(feature.content, progress, 'stories');

        if (updatedContent !== feature.content) {
          await fs.writeFile(feature.filePath, updatedContent, 'utf-8');
          console.log(`✅ Updated ${feature.id}: ${progress.completed}/${progress.total} stories (${progress.percentage}%)`);
          updatedCount++;
        }
      }
    }

    // Re-parse features to get updated status
    const updatedFeatures = await Promise.all(featureFiles.map(parseMarkdownFile));
    const updatedFeatureMap = new Map(updatedFeatures.map((f) => [f.id, f]));

    // Update epics based on features
    for (const epic of epics) {
      const childFeatureIds = extractChildIds(epic.content, 'feature');
      const childFeatures = childFeatureIds.map((id) => updatedFeatureMap.get(id)).filter(Boolean);

      if (childFeatures.length > 0) {
        const progress = calculateProgress(childFeatures);
        const updatedContent = updateProgressInContent(epic.content, progress, 'features');

        if (updatedContent !== epic.content) {
          await fs.writeFile(epic.filePath, updatedContent, 'utf-8');
          console.log(`✅ Updated ${epic.id}: ${progress.completed}/${progress.total} features (${progress.percentage}%)`);
          updatedCount++;
        }
      }
    }

    console.log(`\n✨ Progress update complete! Updated ${updatedCount} documents.`);  } catch (error) {
    console.error('❌ Error updating progress:', error.message);
    process.exit(1);
  }
}

main();
