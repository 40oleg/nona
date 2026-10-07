import Nona.MoveRules

namespace Nona

-- Concrete examples are additional checks; the general theorems are the proof.
def sample : Program Int :=
  [⟨0, .literal 10⟩, ⟨1, .read 0⟩, ⟨2, .literal 999⟩,
   ⟨3, .binary (· + ·) (.read 1) (.literal 5)⟩]

example : (run (optimizeDead sample [3]) (fun _ => 0)) 3 = 15 := by decide
example : (optimizeDead sample [3]).length = 3 := by decide

end Nona

namespace Nona

def input : State Int := fun slot => if slot = 0 then 2 else if slot = 1 then 3 else 0
def sum : Expr Int := .binary (· + ·) (.read 0) (.read 1)

-- A destination can be an operand: the old value is read before the write.
example : (run [⟨0, sum⟩] input) 0 = 5 := by decide
example : (run [⟨2, sum⟩, ⟨0, .read 2⟩] input) 0 = 5 := by decide

-- Missing liveness guard: coalescing destroys an observed temporary (5 vs 0).
example :
    (run [⟨2, sum⟩, ⟨3, .read 2⟩] input) 2 ≠
    (run [⟨3, sum⟩] input) 2 := by decide

-- Missing liveness guard: deleting a live constant changes the return.
example : (run [⟨0, .literal 10⟩] input) 0 ≠ (run [] input) 0 := by decide

-- Missing alias invalidation: a copy retains the source's old value (2 vs 9).
def snapshot : State Int := run [⟨2, .read 0⟩, ⟨0, .literal 9⟩] input
example : (Expr.read 2).eval snapshot ≠
    ((Expr.read 2).substitute 2 0).eval snapshot := by decide

-- Bit-pattern tags illustrate that a move never collapses signed zero.
-- This is an abstract value domain, not an implementation of IEEE arithmetic.
inductive ZeroBits where
  | positive
  | negative
  deriving DecidableEq

example :
    (run (optimizeDead [⟨0, .literal ZeroBits.negative⟩] [0])
      (fun _ => ZeroBits.positive)) 0 = ZeroBits.negative := by decide

-- Optimizer correctness applies to arbitrary input values, not just fixtures.
example (s : State V) (p : Program V) :
    (run (optimizeDead p [0]) s) 0 = (run p s) 0 :=
  optimizer_correct p s [0] 0 (by simp)

end Nona
