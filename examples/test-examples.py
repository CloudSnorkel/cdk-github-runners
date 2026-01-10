#!/usr/bin/env python3
"""
Test script for CDK GitHub Runners examples.

This is mostly for internal use. Users have no reason to use this script.

This script:
1. Synths all TypeScript and Python examples
2. Compares synthesized outputs to ensure they match
3. Deploys TypeScript examples one by one
4. Destroys them immediately after deployment
5. Reports all errors and results
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Dict, List, Tuple, Optional
import difflib
import shutil


cdk_path = shutil.which("cdk")
if not cdk_path:
    print_colored("  ✗ CDK not found. Please install AWS CDK CLI.", Colors.RED)
    sys.exit(1)

npm_path = shutil.which("npm")
if not npm_path:
    print_colored("  ✗ npm not found. Please install npm.", Colors.RED)
    sys.exit(1)

yarn_path = shutil.which("yarn")
if not yarn_path:
    print_colored("  ✗ yarn not found. Please install yarn.", Colors.RED)
    sys.exit(1)


class Colors:
    """ANSI color codes for terminal output."""
    GREEN = '\033[92m'
    RED = '\033[91m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    RESET = '\033[0m'
    BOLD = '\033[1m'


def print_colored(message: str, color: str = Colors.RESET):
    """Print colored message."""
    print(f"{color}{message}{Colors.RESET}")


def format_duration(seconds: float) -> str:
    """Format duration in seconds to human-readable string."""
    if seconds < 60:
        return f"{seconds:.1f}s"
    minutes = int(seconds // 60)
    secs = seconds % 60
    return f"{minutes}m {secs:.1f}s"


def run_command(cmd: List[str], cwd: Optional[Path] = None, capture_output: bool = True) -> Tuple[int, str, str]:
    """Run a command and return exit code, stdout, and stderr."""
    try:
        result = subprocess.run(
            cmd,
            cwd=cwd,
            capture_output=capture_output,
            text=True,
            check=False,
            timeout=600,  # 10 minute timeout
        )
        stdout = result.stdout if capture_output else ""
        stderr = result.stderr if capture_output else ""
        return result.returncode, stdout, stderr
    except subprocess.TimeoutExpired:
        return 1, "", "Command timed out after 10 minutes"
    except Exception as e:
        return 1, "", str(e)


def find_examples(filter_names: Optional[List[str]] = None) -> Tuple[List[str], List[str]]:
    """Find all TypeScript and Python examples.
    
    Args:
        filter_names: Optional list of example names to include. If None, includes all examples.
    """
    examples_dir = Path(__file__).parent
    ts_examples = []
    py_examples = []
    
    for lang in ["typescript", "python"]:
        lang_dir = examples_dir / lang
        if not lang_dir.exists():
            continue
            
        for example_dir in lang_dir.iterdir():
            if not example_dir.is_dir():
                continue
            
            # Filter by example name if filter_names is provided
            if filter_names is not None and example_dir.name not in filter_names:
                continue
                
            app_file = example_dir / ("app.ts" if lang == "typescript" else "app.py")
            if app_file.exists():
                if lang == "typescript":
                    ts_examples.append(str(example_dir.relative_to(examples_dir)))
                else:
                    py_examples.append(str(example_dir.relative_to(examples_dir)))
    
    return sorted(ts_examples), sorted(py_examples)


def normalize_json(json_str: str) -> str:
    """Normalize JSON for comparison."""
    try:
        data = json.loads(json_str)
        return json.dumps(data, sort_keys=True, indent=2)
    except json.JSONDecodeError:
        return json_str


def synth_example(example_path: str, lang: str) -> Tuple[bool, Optional[str], str]:
    """Synthesize a CDK example and return success, template, and error message."""
    project_root = Path(__file__).parent.parent
    example_dir = Path(__file__).parent / example_path
    
    # Install dependencies first
    if lang == "typescript":
        start_time = time.time()
        print_colored(f"  Installing dependencies for {example_path}...", Colors.BLUE)
        code, out, err = run_command([npm_path, "install", "--no-package-lock"], cwd=example_dir)
        duration = time.time() - start_time
        if code != 0:
            return False, None, f"npm install failed: {err}\n{out}"
        print_colored(f"    ✓ Dependencies installed ({format_duration(duration)})", Colors.GREEN)
        
        # Install local package - glob the full real path
        start_time = time.time()
        print_colored(f"  Installing local package for {example_path}...", Colors.BLUE)
        dist_js_dir = (project_root / "dist" / "js").resolve()
        tgz_files = list(dist_js_dir.glob("*.tgz"))
        if not tgz_files:
            return False, None, f"No dist .tgz files found in {dist_js_dir}"
        code, out, err = run_command([npm_path, "install", "--no-save"] + tgz_files, cwd=example_dir)
        duration = time.time() - start_time
        if code != 0:
            return False, None, f"npm install local package failed: {err}\n{out}"
        print_colored(f"    ✓ Local package installed ({format_duration(duration)})", Colors.GREEN)
    elif lang == "python":
        start_time = time.time()
        print_colored(f"  Installing dependencies for {example_path}...", Colors.BLUE)
        code, out, err = run_command(["pip", "install", "-r", "requirements.txt"], cwd=example_dir)
        duration = time.time() - start_time
        if code != 0:
            return False, None, f"pip install requirements failed: {err}\n{out}"
        print_colored(f"    ✓ Dependencies installed ({format_duration(duration)})", Colors.GREEN)
        
        # Install local package - glob the full real path
        start_time = time.time()
        print_colored(f"  Installing local package for {example_path}...", Colors.BLUE)
        dist_python_dir = (project_root / "dist" / "python").resolve()
        whl_files = list(dist_python_dir.glob("*.whl"))
        if not whl_files:
            return False, None, f"No .whl files found in {dist_python_dir}"
        code, out, err = run_command(["pip", "install"] + whl_files, cwd=example_dir)
        duration = time.time() - start_time
        if code != 0:
            return False, None, f"pip install local package failed: {err}\n{out}"
        print_colored(f"    ✓ Local package installed ({format_duration(duration)})", Colors.GREEN)
    
    # Run CDK synth (exclude metadata for cleaner diffs)
    start_time = time.time()
    print_colored(f"  Synthing {example_path}...", Colors.BLUE)
    code, out, err = run_command([
        cdk_path, "synth", 
        "--quiet",
        "--no-asset-metadata",
        "--no-path-metadata",
        "--no-version-reporting",
    ], cwd=example_dir)
    duration = time.time() - start_time
    
    if code != 0:
        return False, None, f"cdk synth failed: {err}\n{out}"
    print_colored(f"    ✓ Synthesis completed ({format_duration(duration)})", Colors.GREEN)
    
    # Find the synthesized template
    # CDK synth outputs to cdk.out/<stack-name>.template.json
    cdk_out = example_dir / "cdk.out"
    if not cdk_out.exists():
        return False, None, "cdk.out directory not found"
    
    # Find the template file
    template_files = list(cdk_out.glob("*.template.json"))
    if not template_files:
        # Also check for nested directories (some CDK versions use subdirectories)
        template_files = list(cdk_out.rglob("*.template.json"))
    
    if not template_files:
        return False, None, "No template.json file found in cdk.out"
    
    # If multiple templates, combine them (for multi-stack examples)
    # For comparison, we'll use the first/main stack template
    template_path = template_files[0]
    try:
        with open(template_path, 'r', encoding='utf-8') as f:
            template = f.read()
        return True, template, ""
    except Exception as e:
        return False, None, f"Failed to read template: {str(e)}"


def compare_templates(ts_template: str, py_template: str) -> Tuple[bool, str]:
    """Compare two CloudFormation templates and return if they match and diff."""
    ts_normalized = normalize_json(ts_template)
    py_normalized = normalize_json(py_template)
    
    if ts_normalized == py_normalized:
        return True, ""
    
    # Generate diff
    diff = list(difflib.unified_diff(
        ts_normalized.splitlines(keepends=True),
        py_normalized.splitlines(keepends=True),
        fromfile="TypeScript",
        tofile="Python",
        lineterm="",
    ))
    
    return False, "".join(diff)


def deploy_example(example_path: str) -> Tuple[bool, str]:
    """Deploy a CDK example."""
    example_dir = Path(__file__).parent / example_path
    
    start_time = time.time()
    print_colored(f"  Deploying {example_path}...", Colors.BLUE)
    try:
        # Run with real-time output but capture for error reporting
        process = subprocess.Popen(
            [cdk_path, "deploy", "--require-approval", "never", "--all"],
            cwd=example_dir,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            encoding='utf-8',
            errors='replace',  # Replace invalid characters instead of failing
            text=True,
            bufsize=1,
            universal_newlines=True,
        )
        
        output_lines = []
        for line in process.stdout:
            print(f"    {line.rstrip()}")
            output_lines.append(line)
        
        process.wait()
        output = "".join(output_lines)
        
        duration = time.time() - start_time
        if process.returncode != 0:
            return False, f"cdk deploy failed:\n{output}"
        
        print_colored(f"    ✓ Deployment completed ({format_duration(duration)})", Colors.GREEN)
        return True, ""
    except Exception as e:
        return False, f"Deployment error: {str(e)}"


def destroy_example(example_path: str) -> Tuple[bool, str]:
    """Destroy a CDK example."""
    example_dir = Path(__file__).parent / example_path
    
    start_time = time.time()
    print_colored(f"  Destroying {example_path}...", Colors.BLUE)
    try:
        # Run with real-time output but capture for error reporting
        process = subprocess.Popen(
            [cdk_path, "destroy", "--force", "--all"],
            cwd=example_dir,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            encoding='utf-8',
            errors='replace',  # Replace invalid characters instead of failing
            text=True,
            bufsize=1,
            universal_newlines=True,
        )
        
        output_lines = []
        for line in process.stdout:
            print(f"    {line.rstrip()}")
            output_lines.append(line)
        
        process.wait()
        output = "".join(output_lines)
        duration = time.time() - start_time
        
        if process.returncode != 0:
            return False, f"cdk destroy failed:\n{output}"
        
        print_colored(f"    ✓ Destruction completed ({format_duration(duration)})", Colors.GREEN)
        return True, ""
    except Exception as e:
        return False, f"Destruction error: {str(e)}"


def get_stack_name(example_path: str) -> str:
    """Get the stack name from the example."""
    # Try to extract from the app file
    example_dir = Path(__file__).parent / example_path
    app_file = example_dir / ("app.ts" if "typescript" in example_path else "app.py")
    
    if app_file.exists():
        content = app_file.read_text(encoding='utf-8')
        # Look for common patterns like "new Stack(app, 'StackName')" or "Stack(app, 'StackName')"
        import re
        match = re.search(r"new\s+\w+Stack\([^,]+,\s*['\"]([^'\"]+)['\"]", content)
        if match:
            return match.group(1)
        match = re.search(r"\w+Stack\([^,]+,\s*['\"]([^'\"]+)['\"]", content)
        if match:
            return match.group(1)
    
    # Fallback to directory name
    return Path(example_path).name.replace("-", "").title().replace(" ", "")


def check_prerequisites() -> bool:
    """Check if required tools are available."""
    print_colored("Checking prerequisites...", Colors.BLUE)
    
    # Check CDK
    code, _, _ = run_command([cdk_path, "--version"])
    if code != 0:
        print_colored("  ✗ CDK not found. Please install AWS CDK CLI.", Colors.RED)
        return False
    print_colored("  ✓ CDK found", Colors.GREEN)
    
    # Check npm (for TypeScript examples)
    code, _, _ = run_command([npm_path, "--version"])
    if code != 0:
        print_colored("  ✗ npm not found. TypeScript examples will fail.", Colors.YELLOW)
    else:
        print_colored("  ✓ npm found", Colors.GREEN)
    
    # Check python (for Python examples)
    code, _, _ = run_command(["python", "--version"])
    if code != 0:
        code, _, _ = run_command(["python3", "--version"])
    if code != 0:
        print_colored("  ✗ Python not found. Python examples will fail.", Colors.YELLOW)
    else:
        print_colored("  ✓ Python found", Colors.GREEN)
    
    print()
    return True


def main():
    """Main test function."""
    parser = argparse.ArgumentParser(description="Test CDK GitHub Runners examples")
    parser.add_argument(
        "--skip-deploy",
        action="store_true",
        help="Skip deployment and destruction phase (faster, only tests synthesis and comparison)",
    )
    parser.add_argument(
        "--skip-package",
        action="store_true",
        help="Skip package building phase (faster, only tests synthesis and comparison)",
    )
    parser.add_argument(
        "--examples",
        nargs="+",
        metavar="EXAMPLE",
        help="Only process specific examples by name (e.g., --examples advanced simple-codebuild). Can be specified multiple times or space-separated.",
    )
    args = parser.parse_args()
    
    script_start_time = time.time()
    print_colored("=" * 80, Colors.BOLD)
    print_colored("CDK GitHub Runners Examples Test Script", Colors.BOLD)
    print_colored("=" * 80, Colors.BOLD)
    print()
    
    # Check prerequisites
    if not check_prerequisites():
        print_colored("Prerequisites check failed. Please install required tools.", Colors.RED)
        return 1
    
    # Build the package
    if not args.skip_package:
        print_colored("=" * 80, Colors.BOLD)
        print_colored("Building Package", Colors.BOLD)
        print_colored("=" * 80, Colors.BOLD)
        print()
        
        project_root = Path(__file__).parent.parent
        
        start_time = time.time()
        print_colored("Running yarn run bundle...", Colors.BLUE)
        code, out, err = run_command([yarn_path, "run", "bundle"], cwd=project_root)
        duration = time.time() - start_time
        if code != 0:
            print_colored(f"  ✗ Bundle failed: {err}\n{out}", Colors.RED)
            print_colored("\nPackage building failed. Stopping.", Colors.RED)
            return 1
        print_colored(f"  ✓ Bundle successful ({format_duration(duration)})", Colors.GREEN)
        print()
        
        start_time = time.time()
        print_colored("Running yarn run compile...", Colors.BLUE)
        code, out, err = run_command([yarn_path, "run", "compile"], cwd=project_root)
        duration = time.time() - start_time
        if code != 0:
            print_colored(f"  ✗ Compile failed: {err}\n{out}", Colors.RED)
            print_colored("\nPackage building failed. Stopping.", Colors.RED)
            return 1
        print_colored(f"  ✓ Compile successful ({format_duration(duration)})", Colors.GREEN)
        print()
        
        start_time = time.time()
        print_colored("Running yarn run package:js...", Colors.BLUE)
        code, out, err = run_command([yarn_path, "run", "package:js"], cwd=project_root)
        duration = time.time() - start_time
        if code != 0:
            print_colored(f"  ✗ Package JS failed: {err}\n{out}", Colors.RED)
            print_colored("\nPackage building failed. Stopping.", Colors.RED)
            return 1
        print_colored(f"  ✓ Package JS successful ({format_duration(duration)})", Colors.GREEN)
        print()
        
        start_time = time.time()
        print_colored("Running yarn run package:python...", Colors.BLUE)
        code, out, err = run_command([yarn_path, "run", "package:python"], cwd=project_root)
        duration = time.time() - start_time
        if code != 0:
            print_colored(f"  ✗ Package Python failed: {err}\n{out}", Colors.RED)
            print_colored("\nPackage building failed. Stopping.", Colors.RED)
            return 1
        print_colored(f"  ✓ Package Python successful ({format_duration(duration)})", Colors.GREEN)
        print()
    
    # Find examples
    print_colored("Finding examples...", Colors.BLUE)
    filter_names = args.examples if args.examples else None
    if filter_names:
        print_colored(f"Filtering to examples: {', '.join(filter_names)}", Colors.BLUE)
    ts_examples, py_examples = find_examples(filter_names=filter_names)
    
    if not ts_examples and not py_examples:
        print_colored("No examples found matching the filter.", Colors.RED)
        return 1
    
    print_colored(f"Found {len(ts_examples)} TypeScript examples", Colors.GREEN)
    print_colored(f"Found {len(py_examples)} Python examples", Colors.GREEN)
    print()
    
    # Build a mapping of example names
    example_names = set()
    for ex in ts_examples:
        example_names.add(Path(ex).name)
    for ex in py_examples:
        example_names.add(Path(ex).name)
    
    # Phase 1: Synth all examples
    print_colored("=" * 80, Colors.BOLD)
    print_colored("Phase 1: Synthesizing Examples", Colors.BOLD)
    print_colored("=" * 80, Colors.BOLD)
    print()
    
    ts_templates: Dict[str, str] = {}
    py_templates: Dict[str, str] = {}
    synth_errors: List[Tuple[str, str, str]] = []  # (example, lang, error)
    
    # Synth TypeScript examples
    for example in ts_examples:
        example_name = Path(example).name
        print_colored(f"Synthing TypeScript: {example}", Colors.YELLOW)
        success, template, error = synth_example(example, "typescript")
        if success:
            ts_templates[example_name] = template
            print_colored(f"  ✓ Success", Colors.GREEN)
        else:
            synth_errors.append((example, "TypeScript", error))
            print_colored(f"  ✗ Failed: {error}", Colors.RED)
        print()
    
    # Synth Python examples
    for example in py_examples:
        example_name = Path(example).name
        print_colored(f"Synthing Python: {example}", Colors.YELLOW)
        success, template, error = synth_example(example, "python")
        if success:
            py_templates[example_name] = template
            print_colored(f"  ✓ Success", Colors.GREEN)
        else:
            synth_errors.append((example, "Python", error))
            print_colored(f"  ✗ Failed: {error}", Colors.RED)
        print()
    
    # Phase 2: Compare templates
    print_colored("=" * 80, Colors.BOLD)
    print_colored("Phase 2: Comparing Templates", Colors.BOLD)
    print_colored("=" * 80, Colors.BOLD)
    print()
    
    comparison_errors: List[Tuple[str, str]] = []  # (example, diff)
    
    for example_name in example_names:
        if example_name not in ts_templates:
            print_colored(f"⚠ {example_name}: No TypeScript template", Colors.YELLOW)
            continue
        if example_name not in py_templates:
            print_colored(f"⚠ {example_name}: No Python template", Colors.YELLOW)
            continue
        
        print_colored(f"Comparing {example_name}...", Colors.YELLOW)
        match, diff = compare_templates(ts_templates[example_name], py_templates[example_name])
        if match:
            print_colored(f"  ✓ Templates match", Colors.GREEN)
        else:
            comparison_errors.append((example_name, diff))
            print_colored(f"  ✗ Templates differ", Colors.RED)
            # Show first 20 lines of diff
            diff_lines = diff.split('\n')[:20]
            for line in diff_lines:
                if line.startswith('+'):
                    print_colored(f"    {line}", Colors.GREEN)
                elif line.startswith('-'):
                    print_colored(f"    {line}", Colors.RED)
                else:
                    print(f"    {line}")
            if len(diff.split('\n')) > 20:
                remaining = len(diff.split('\n')) - 20
                print_colored(f"    ... ({remaining} more lines)", Colors.YELLOW)
        print()
    
    # Phase 3: Deploy and destroy TypeScript examples
    deploy_errors: List[Tuple[str, str]] = []  # (example, error)
    destroy_errors: List[Tuple[str, str]] = []  # (example, error)
    
    if args.skip_deploy:
        print_colored("=" * 80, Colors.BOLD)
        print_colored("Phase 3: Skipped (--skip-deploy flag)", Colors.BOLD)
        print_colored("=" * 80, Colors.BOLD)
        print()
    else:
        print_colored("=" * 80, Colors.BOLD)
        print_colored("Phase 3: Deploying and Destroying TypeScript Examples", Colors.BOLD)
        print_colored("=" * 80, Colors.BOLD)
        print()
        
        # Only deploy examples that successfully synthesized
        successful_ts_examples = [ex for ex in ts_examples if Path(ex).name in ts_templates]
        
        for example in successful_ts_examples:
            example_name = Path(example).name
            print_colored(f"Testing deployment: {example}", Colors.YELLOW)
            
            # Deploy
            success, error = deploy_example(example)
            if not success:
                deploy_errors.append((example, error))
                print_colored(f"  ✗ Deploy failed: {error}", Colors.RED)
                print()
                continue
            
            print_colored(f"  ✓ Deployed successfully", Colors.GREEN)
            
            # Destroy
            success, error = destroy_example(example)
            if not success:
                destroy_errors.append((example, error))
                print_colored(f"  ✗ Destroy failed: {error}", Colors.RED)
            else:
                print_colored(f"  ✓ Destroyed successfully", Colors.GREEN)
            
            print()
        
        # Report skipped examples
        skipped_examples = [ex for ex in ts_examples if Path(ex).name not in ts_templates]
        if skipped_examples:
            print_colored(f"Skipped {len(skipped_examples)} example(s) due to synthesis failures:", Colors.YELLOW)
            for ex in skipped_examples:
                print_colored(f"  - {ex}", Colors.YELLOW)
            print()
    
    # Summary
    print_colored("=" * 80, Colors.BOLD)
    print_colored("Summary", Colors.BOLD)
    print_colored("=" * 80, Colors.BOLD)
    print()
    
    total_errors = len(synth_errors) + len(comparison_errors) + len(deploy_errors) + len(destroy_errors)
    
    if synth_errors:
        print_colored(f"Synthesis Errors: {len(synth_errors)}", Colors.RED)
        for example, lang, error in synth_errors:
            print_colored(f"  - {lang}: {example}", Colors.RED)
            print(f"    {error[:300]}...")
        print()
    
    if comparison_errors:
        print_colored(f"Template Comparison Errors: {len(comparison_errors)}", Colors.RED)
        for example, diff in comparison_errors:
            print_colored(f"  - {example}: Templates differ", Colors.RED)
        print()
    
    if deploy_errors:
        print_colored(f"Deployment Errors: {len(deploy_errors)}", Colors.RED)
        for example, error in deploy_errors:
            print_colored(f"  - {example}", Colors.RED)
            print(f"    {error[-500:]}...")
        print()
    
    if destroy_errors:
        print_colored(f"Destroy Errors: {len(destroy_errors)}", Colors.RED)
        for example, error in destroy_errors:
            print_colored(f"  - {example}", Colors.RED)
            print(f"    {error[-500:]}...")
        print()
    
    total_duration = time.time() - script_start_time
    
    print_colored("=" * 80, Colors.BOLD)
    print_colored(f"Total execution time: {format_duration(total_duration)}", Colors.BOLD)
    print_colored("=" * 80, Colors.BOLD)
    print()
    
    if total_errors == 0:
        print_colored("✓ All tests passed!", Colors.GREEN)
        return 0
    else:
        print_colored(f"✗ {total_errors} error(s) found", Colors.RED)
        return 1


if __name__ == "__main__":
    sys.exit(main())
