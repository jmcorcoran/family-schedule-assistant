#!/bin/bash

# Test Runner Script for Family Schedule Assistant
# Usage: ./run-tests.sh [unit|e2e|all]

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${BLUE}🧪 Family Schedule Assistant - Test Runner${NC}\n"

# Check if Deno is installed
if ! command -v deno &> /dev/null; then
    echo -e "${YELLOW}⚠️  Deno is not installed. Installing...${NC}"
    curl -fsSL https://deno.land/install.sh | sh
    export PATH="$HOME/.deno/bin:$PATH"
fi

# Load environment variables from .env if it exists
if [ -f .env ]; then
    echo -e "${BLUE}📝 Loading environment variables from .env${NC}"
    export $(cat .env | grep -v '^#' | xargs)
    export SUPABASE_URL=${VITE_SUPABASE_URL}
    export SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY}
fi

TEST_TYPE=${1:-all}

run_unit_tests() {
    echo -e "\n${BLUE}Running Unit Tests...${NC}\n"
    deno test --allow-env --allow-net supabase/functions/process-message/index.test.ts
}

run_e2e_tests() {
    echo -e "\n${BLUE}Running E2E Tests...${NC}\n"

    if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_ANON_KEY" ]; then
        echo -e "${YELLOW}⚠️  Warning: SUPABASE_URL or SUPABASE_ANON_KEY not set${NC}"
        echo "   E2E tests may fail. Set these environment variables or add them to .env"
    fi

    deno test --allow-env --allow-net tests/e2e.test.ts
}

case $TEST_TYPE in
    unit)
        run_unit_tests
        ;;
    e2e)
        run_e2e_tests
        ;;
    all)
        run_unit_tests
        run_e2e_tests
        ;;
    *)
        echo -e "${YELLOW}Usage: $0 [unit|e2e|all]${NC}"
        echo "  unit - Run unit tests only"
        echo "  e2e  - Run end-to-end tests only"
        echo "  all  - Run all tests (default)"
        exit 1
        ;;
esac

echo -e "\n${GREEN}✅ All tests completed!${NC}\n"
