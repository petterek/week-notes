#!/bin/bash
components=(
  "app-brand" "nav-meta" "ctx-switcher" "help-modal" "person-tip"
  "note-card" "markdown-preview" "note-editor" "open-tasks" "task-create"
  "task-create-modal" "upcoming-meetings" "week-results" "task-completed"
  "week-section" "week-list" "week-pill" "global-search" "week-calendar"
  "calendar-page" "settings-page"
)

for comp in "${components[@]}"; do
  code=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/debug/$comp)
  echo "$comp: $code"
done
