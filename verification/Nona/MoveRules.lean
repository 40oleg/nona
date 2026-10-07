import Std

/-!
A pure, straight-line fragment of Nona's slot IR. Values and operators are
parameters: the move rules do not assume arithmetic laws for JS Numbers.
The TypeScript implementation and CFG liveness are outside this model.
-/
namespace Nona

abbrev Slot := Nat
abbrev State (Value : Type) := Slot → Value

inductive Expr (Value : Type) where
  | literal : Value → Expr Value
  | read : Slot → Expr Value
  | unary : (Value → Value) → Expr Value → Expr Value
  | binary : (Value → Value → Value) → Expr Value → Expr Value → Expr Value

namespace Expr

def eval (s : State V) : Expr V → V
  | .literal v => v
  | .read slot => s slot
  | .unary f a => f (eval s a)
  | .binary f a b => f (eval s a) (eval s b)

def reads : Expr V → List Slot
  | .literal _ => []
  | .read slot => [slot]
  | .unary _ a => reads a
  | .binary _ a b => reads a ++ reads b

/-- Only constants and copies are removed, matching the production move pass.
The TDZ marker can be represented as a literal in the abstract value domain. -/
def isMove : Expr V → Bool
  | .literal _ | .read _ => true
  | _ => false

/-- Replace reads, but neither duplicate nor remove expression evaluation. -/
def substitute (source to : Slot) : Expr V → Expr V
  | .literal v => .literal v
  | .read slot => .read (if slot = source then to else slot)
  | .unary f a => .unary f (substitute source to a)
  | .binary f a b => .binary f (substitute source to a) (substitute source to b)

end Expr

/-- All operands are evaluated in the old state before the destination changes. -/
def write (s : State V) (dest : Slot) (value : V) : State V :=
  fun slot => if slot = dest then value else s slot

structure Instr (Value : Type) where
  dest : Slot
  rhs : Expr Value

abbrev Program (Value : Type) := List (Instr Value)

def step (op : Instr V) (s : State V) : State V :=
  write s op.dest (op.rhs.eval s)

def run : Program V → State V → State V
  | [], s => s
  | op :: rest, s => run rest (step op s)

/-- Equality only at observed slots, including bit/identity distinctions in V. -/
def Agree (live : List Slot) (s t : State V) : Prop :=
  ∀ slot, slot ∈ live → s slot = t slot

def before (op : Instr V) (live : List Slot) : List Slot :=
  live.filter (fun slot => slot != op.dest) ++ op.rhs.reads

def liveIn : Program V → List Slot → List Slot
  | [], live => live
  | op :: rest, live => before op (liveIn rest live)

/-- Recursive dead-move elimination for a block with an explicit observation set. -/
def optimizeDead : Program V → List Slot → Program V
  | [], _ => []
  | op :: rest, live =>
    let tail := optimizeDead rest live
    if op.rhs.isMove = true ∧ op.dest ∉ liveIn rest live then tail
    else op :: tail

/-- The copy rule requires the alias equality to hold at the point of use. -/
theorem substitute_correct (s : State V) (source to : Slot)
    (same : s source = s to) (e : Expr V) :
    (e.substitute source to).eval s = e.eval s := by
  induction e with
  | literal v => rfl
  | read slot =>
    by_cases h : slot = source
    · simp [Expr.substitute, Expr.eval, h, same]
    · simp [Expr.substitute, Expr.eval, h]
  | unary f a ih => simp [Expr.substitute, Expr.eval, ih]
  | binary f a b iha ihb => simp [Expr.substitute, Expr.eval, iha, ihb]

/-- A dead write preserves every observed slot. -/
theorem dead_write_correct (s : State V) (dest : Slot) (value : V)
    (live : List Slot) (dead : dest ∉ live) :
    Agree live (write s dest value) s := by
  intro slot observed
  have different : slot ≠ dest := fun h => dead (h ▸ observed)
  simp [write, different]

/-- `t = e; x = t` and `x = e` agree if t is dead.
No restriction forbids x from appearing in e's operands. -/
theorem coalesce_correct (s : State V) (e : Expr V) (temp dest : Slot)
    (live : List Slot) (dead : temp ∉ live) :
    Agree live
      (step ⟨dest, .read temp⟩ (step ⟨temp, e⟩ s))
      (step ⟨dest, e⟩ s) := by
  intro slot observed
  have notTemp : slot ≠ temp := fun h => dead (h ▸ observed)
  simp [step, Expr.eval, write, notTemp]

/-- Expression evaluation depends only on the slots it reads. -/
theorem eval_congr (e : Expr V) (s t : State V)
    (agree : Agree e.reads s t) : e.eval s = e.eval t := by
  induction e with
  | literal v => rfl
  | read slot => exact agree slot (by simp [Expr.reads])
  | unary f a ih =>
    exact congrArg f (ih agree)
  | binary f a b iha ihb =>
    have ha := iha (fun slot h => agree slot (by simp [Expr.reads, h]))
    have hb := ihb (fun slot h => agree slot (by simp [Expr.reads, h]))
    simp [Expr.eval, ha, hb]

/-- Backward liveness supplies exactly the observations needed by one step. -/
theorem step_congr (op : Instr V) (live : List Slot) (s t : State V)
    (agree : Agree (before op live) s t) : Agree live (step op s) (step op t) := by
  have value : op.rhs.eval s = op.rhs.eval t :=
    eval_congr op.rhs s t (fun slot h => agree slot (by simp [before, h]))
  intro slot observed
  by_cases written : slot = op.dest
  · simp [step, write, written, value]
  · have unchanged := agree slot (by simp [before, observed, written])
    simp [step, write, written, unchanged]

/-- Arbitrary continuations in the pure fragment respect computed liveness. -/
theorem run_congr (p : Program V) (live : List Slot) (s t : State V)
    (agree : Agree (liveIn p live) s t) : Agree live (run p s) (run p t) := by
  induction p generalizing s t with
  | nil => exact agree
  | cons op rest ih =>
    exact ih (step op s) (step op t) (step_congr op (liveIn rest live) s t agree)

/-- The whole optimizer preserves observations for every program in the fragment. -/
theorem optimizer_correct (p : Program V) (s : State V) (live : List Slot) :
    Agree live (run (optimizeDead p live) s) (run p s) := by
  induction p generalizing s with
  | nil => intro slot _; rfl
  | cons op rest ih =>
    simp only [optimizeDead]
    split
    · rename_i removable
      have continuation := run_congr rest live s (step op s)
        (fun slot observed =>
          (dead_write_correct s op.dest (op.rhs.eval s)
            (liveIn rest live) removable.2 slot observed).symm)
      intro slot observed
      exact (ih s slot observed).trans (continuation slot observed)
    · exact ih (step op s)

end Nona
