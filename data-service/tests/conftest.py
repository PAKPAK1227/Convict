"""Make the data-service modules importable from the tests folder."""
import os
import sys

# data-service/ (parent of tests/) so `import main` / `import evaluate_theses` work.
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
