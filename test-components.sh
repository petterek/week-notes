#!/bin/bash
# Quick smoke tests for component rendering

echo "Testing component debug pages..."

# Test note-card - should load and render
echo -n "note-card: "
curl -s http://localhost:3001/debug/note-card | grep -q "MockNotesService" && echo "✓" || echo "✗"

# Test open-tasks - should have week field in tasks
echo -n "open-tasks (week field): "
curl -s http://localhost:3001/debug/open-tasks | grep -q "week.*thisWeek" && echo "✓" || echo "✗"

# Test search - should return array not {q, results}
echo -n "global-search (array return): "
curl -s http://localhost:3001/debug/global-search | grep -q "Array.isArray(data)" && echo "✓" || echo "✗"

# Test all components return 200
echo "HTTP 200 check:"
for comp in app-brand nav-meta ctx-switcher help-modal person-tip note-card markdown-preview note-editor open-tasks task-create task-create-modal upcoming-meetings week-results task-completed week-section week-list week-pill global-search week-calendar calendar-page settings-page; do
  code=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3001/debug/$comp)
  if [ "$code" = "200" ]; then
    echo "  $comp: ✓"
  else
    echo "  $comp: ✗ ($code)"
  fi
done

echo ""
echo "Mock service shape verification:"
echo "Checking inline mock definitions..."

# Verify search mock returns proper shape
curl -s http://localhost:3001/debug/global-search | grep -q "type:.*'note'" && echo "  search has type field: ✓" || echo "  search has type field: ✗"
curl -s http://localhost:3001/debug/global-search | grep -q "identifier:" && echo "  search has identifier field: ✓" || echo "  search has identifier field: ✗"

# Verify task mock has week field
curl -s http://localhost:3001/debug/open-tasks | grep -q "week: thisWeek" && echo "  task has week field: ✓" || echo "  task has week field: ✗"

echo "Done!"
