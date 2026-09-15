# GitHub Actions Learning Guide

## Overview
This repository is a learning resource for GitHub Actions workflows and automation.

## Table of Contents
1. [Workflow Basics](#workflow-basics)
2. [Events](#events)
3. [Jobs](#jobs)
4. [Steps](#steps)
5. [Resources](#resources)

## Workflow Basics

GitHub Actions workflows are defined in YAML files located in `.github/workflows/` directory.

### Anatomy of a Workflow
```yaml
name: Workflow Name
on: [event]
jobs:
  job-name:
    runs-on: ubuntu-latest
    steps:
      - uses: action/name@version
      - run: command
```

## Events

Workflows trigger on various GitHub events:
- `push` - When code is pushed
- `pull_request` - When a PR is created/updated
- `schedule` - Cron-based triggers
- `workflow_dispatch` - Manual trigger
- `release` - When a release is published

## Jobs

Jobs run in parallel by default or can be made sequential with dependencies.

```yaml
jobs:
  job1:
    runs-on: ubuntu-latest
    steps:
      - run: echo "Job 1"
  
  job2:
    needs: job1
    runs-on: ubuntu-latest
    steps:
      - run: echo "Job 2"
```

## Steps

Steps are individual tasks within a job. They can use actions or run commands.

```yaml
steps:
  - name: Checkout code
    uses: actions/checkout@v3
  
  - name: Run script
    run: ./script.sh
    env:
      MY_VAR: value
```

## Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [GitHub Marketplace](https://github.com/marketplace?type=actions)
- [Workflow Syntax](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions)

---

## Experiments & Notes

Use this section to track your learning experiments and discoveries.

### Experiment 1: Hello World Workflow
- **Date**: 2026-09-15
- **Description**: Basic workflow that runs on push/PR
- **File**: `.github/workflows/hello-world.yml`
- **Learnings**: TBD
