"""
InkWise Deterministic Math Verification Service
Powered by SymPy & FastAPI
Runs locally on port 8001
"""
import sys
import time
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import sympy as sp
from sympy.parsing.sympy_parser import (
    parse_expr,
    standard_transformations,
    implicit_multiplication_application,
    convert_xor,
)

app = FastAPI(
    title="InkWise Math Verifier",
    description="Deterministic symbolic mathematics verification engine using SymPy",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

transformations = standard_transformations + (
    implicit_multiplication_application,
    convert_xor,
)

# Safe locals for mathematical symbols
ALLOWED_FUNCTIONS = {
    'sin': sp.sin, 'cos': sp.cos, 'tan': sp.tan,
    'asin': sp.asin, 'acos': sp.acos, 'atan': sp.atan,
    'exp': sp.exp, 'log': sp.log, 'ln': sp.log,
    'sqrt': sp.sqrt, 'abs': sp.Abs,
    'pi': sp.pi, 'E': sp.E, 'oo': sp.oo
}

class VerificationRequest(BaseModel):
    operation: str = Field(..., description="differentiate | integrate | simplify | verify_step | solve | evaluate")
    expression: str = Field(..., description="Target expression in standard math notation")
    variable: str = Field(default="x", description="Independent variable (default: x)")
    expected_result: Optional[str] = Field(default=None, description="Expected expression to verify against")
    assumptions: Optional[List[str]] = Field(default=[], description="List of domain assumptions e.g., ['x > 0', 'x != 0']")
    substitutions: Optional[Dict[str, float]] = Field(default=None, description="Values for numeric evaluation")

class StepCheckRequest(BaseModel):
    previous_step: str
    current_step: str
    variable: str = "x"
    assumptions: Optional[List[str]] = []

class StepCheckResponse(BaseModel):
    is_valid: bool
    status: str # verified, invalid, unverified
    difference_simplified: str
    explanation: str
    domain_warnings: List[str] = []

def safe_parse(expr_str: str) -> sp.Expr:
    """Parse expression with restricted transformations to prevent code execution."""
    cleaned = expr_str.strip().replace('^', '**')
    # Filter dangerous symbols
    if any(k in cleaned for k in ['__', 'import', 'eval', 'exec', 'open', 'os', 'sys']):
        raise ValueError("Invalid mathematical token detected.")
    return parse_expr(cleaned, transformations=transformations, local_dict=ALLOWED_FUNCTIONS)

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "InkWise SymPy Engine",
        "sympy_version": sp.__version__,
        "python_version": sys.version,
        "capabilities": [
            "symbolic_differentiation",
            "symbolic_integration",
            "equation_solving",
            "step_equivalence_verification",
            "domain_checks"
        ]
    }

@app.post("/api/math/verify")
def verify_math(req: VerificationRequest) -> Dict[str, Any]:
    start_time = time.time()
    try:
        var = sp.Symbol(req.variable)
        expr = safe_parse(req.expression)
        
        result_expr = None
        is_verified = False
        verification_status = "unverified"
        domain_notes = []
        
        # Check domain restrictions
        denom = sp.denom(expr)
        if denom != 1:
            zeros = sp.solve(denom, var)
            if zeros:
                domain_notes.append(f"Domain restriction: {req.variable} != {', '.join(str(z) for z in zeros)}")

        if req.operation == "differentiate":
            result_expr = sp.diff(expr, var)
            if req.expected_result:
                expected = safe_parse(req.expected_result)
                diff = sp.simplify(result_expr - expected)
                is_verified = (diff == 0)
                verification_status = "verified" if is_verified else "failed"

        elif req.operation == "integrate":
            result_expr = sp.integrate(expr, var)
            if req.expected_result:
                expected = safe_parse(req.expected_result)
                # In indefinite integration, difference may be constant
                diff_deriv = sp.diff(result_expr - expected, var)
                is_verified = (sp.simplify(diff_deriv) == 0)
                verification_status = "verified" if is_verified else "failed"

        elif req.operation == "simplify":
            result_expr = sp.simplify(expr)
            if req.expected_result:
                expected = safe_parse(req.expected_result)
                diff = sp.simplify(result_expr - expected)
                is_verified = (diff == 0)
                verification_status = "verified" if is_verified else "failed"

        elif req.operation == "solve":
            solutions = sp.solve(expr, var)
            duration_ms = int((time.time() - start_time) * 1000)
            return {
                "success": True,
                "operation": req.operation,
                "solutions": [str(s) for s in solutions],
                "latex_solutions": [sp.latex(s) for s in solutions],
                "domain_warnings": domain_notes,
                "duration_ms": duration_ms
            }

        elif req.operation == "evaluate":
            if req.substitutions:
                subs_dict = {sp.Symbol(k): v for k, v in req.substitutions.items()}
                eval_val = float(expr.subs(subs_dict).evalf())
                duration_ms = int((time.time() - start_time) * 1000)
                return {
                    "success": True,
                    "operation": req.operation,
                    "value": eval_val,
                    "duration_ms": duration_ms
                }
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported operation: {req.operation}")

        duration_ms = int((time.time() - start_time) * 1000)
        return {
            "success": True,
            "operation": req.operation,
            "original_expression": str(expr),
            "result_expression": str(result_expr),
            "result_latex": sp.latex(result_expr),
            "is_verified": is_verified,
            "verification_status": verification_status,
            "domain_warnings": domain_notes,
            "duration_ms": duration_ms
        }

    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "verification_status": "failed",
            "duration_ms": int((time.time() - start_time) * 1000)
        }

@app.post("/api/math/check_step", response_model=StepCheckResponse)
def check_step(req: StepCheckRequest):
    try:
        var = sp.Symbol(req.variable)
        prev = safe_parse(req.previous_step)
        curr = safe_parse(req.current_step)
        
        diff = sp.simplify(curr - prev)
        is_valid = (diff == 0)
        
        domain_warnings = []
        denom_prev = sp.denom(prev)
        denom_curr = sp.denom(curr)
        if denom_curr != denom_prev and denom_curr != 1:
            zeros = sp.solve(denom_curr, var)
            if zeros:
                domain_warnings.append(f"Excluded values introduced: {req.variable} != {', '.join(str(z) for z in zeros)}")
                
        return StepCheckResponse(
            is_valid=is_valid,
            status="verified" if is_valid else "invalid",
            difference_simplified=str(diff),
            explanation="Expressions are algebraically equivalent." if is_valid else f"Algebraic error detected: difference is {diff}",
            domain_warnings=domain_warnings
        )
    except Exception as e:
        return StepCheckResponse(
            is_valid=False,
            status="unverified",
            difference_simplified="error",
            explanation=f"Could not verify step deterministically: {str(e)}",
            domain_warnings=[]
        )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8001)
