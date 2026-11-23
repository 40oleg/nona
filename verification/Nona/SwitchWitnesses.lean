import Nona.SwitchDispatch

namespace Nona.Switch

open Numeric

private def num (n : Int) (target : Nat) : Clause :=
  ⟨some (.literal (.number (.integer n))), target⟩

private def frac (f : Fraction) (target : Nat) : Clause :=
  ⟨some (.literal (.number (.fraction f))), target⟩

def mixed : List Clause :=
  [num 1 0, frac oneAndHalf 1, ⟨none, 2⟩, num 2 3, num 4 4, num 5 5,
    frac oneAndHalf 6, num 1 7]

theorem mixed_construction :
    (buildTable mixed).map (fun t => (t.low, t.length, t.cells)) =
      some (1, 5, [some 0, some 3, none, some 4, some 5]) := by decide

theorem mixed_dispatch :
    selectedDispatch Number.integer mixed (.number (.integer 3)) 99 = 2 ∧
    selectedDispatch Number.integer mixed (.number (.fraction oneAndHalf)) 99 = 1 ∧
    selectedDispatch Number.integer mixed (.number (.fraction twoAndHalf)) 99 = 2 ∧
    selectedDispatch Number.integer mixed (.number (.integer 1)) 99 = 0 := by decide

theorem low_one_fallback :
    (buildTable mixed).map (fun t =>
      (decide (tableAdmission Number.integer t (.integer 0)),
      decide (tableAdmission Number.integer t (.integer (-9223372036854775808))))) =
        some (false, false) := by
  decide

theorem signed_index_counterexample :
    (0 - 1 : Int) < 5 ∧ ¬ ((0 - 1 : Int) % 18446744073709551616 < 5) ∧
    ¬ ((-9223372036854775808 - 1 : Int) % 18446744073709551616 < 5) := by decide

theorem key_guard_endpoints :
    ¬ keyRange (-2147483648) ∧ ¬ keyRange 2147483648 ∧
    keyRange (-2147483647) ∧ keyRange 2147483647 ∧ InInt32 (-2147483648) := by decide

private def effectful : List Clause :=
  [⟨some (.dynamic (.number (.integer 1))), 0⟩,
    num 1 1, num 2 2, num 4 3, num 5 4]

/-- Omitting the whole-switch literal guard can skip an earlier dynamic
matching clause (and its effects); key-map lookup would select target 1. -/
theorem missing_literal_guard_counterexample :
    (buildTable effectful).isNone = true ∧ firstKey effectful 1 = some 1 ∧
    linear effectful (.number (.integer 1)) 99 = 0 := by decide

private def faultyFractionEq : Value → Value → Prop
  | .number (.fraction _), .number (.fraction _) => True
  | x, y => chainEq x y

private instance (x y : Value) : Decidable (faultyFractionEq x y) := by
  unfold faultyFractionEq
  split <;> infer_instance

theorem faulty_fraction_equality_counterexample :
    search faultyFractionEq (.number (.fraction twoAndHalf)) [frac oneAndHalf 0] = some 0 ∧
    linear [frac oneAndHalf 0] (.number (.fraction twoAndHalf)) 99 = 99 := by decide

private def lostFractionEq : Value → Value → Prop
  | .number (.fraction _), .number (.fraction _) => False
  | x, y => chainEq x y

private instance (x y : Value) : Decidable (lostFractionEq x y) := by
  unfold lostFractionEq
  split <;> infer_instance

/-- The rejected experiment's always-false fractional predicate loses even
reflexive identity. It cannot be used as the chain's equality specification. -/
theorem lost_fraction_identity_counterexample :
    search lostFractionEq (.number (.fraction oneAndHalf)) [frac oneAndHalf 0] = none ∧
    linear [frac oneAndHalf 0] (.number (.fraction oneAndHalf)) 99 = 0 := by decide

theorem missing_integrality_guard_counterexample :
    truncate (.fraction oneAndHalf) = some 1 ∧
    ¬ strictEq (.number (.integer 1)) (.number (.fraction oneAndHalf)) := by decide

def oneAndQuarter : Fraction := ⟨false, 1, 1, 1, by decide, by decide, by decide⟩

/-- A different exponent must not collapse to the same fractional identity.
The universal bridge is numberEq_fraction_iff, not just these witnesses. -/
theorem mathematical_equality_witnesses :
    strictEq (.number (.fraction oneAndHalf)) (.number (.fraction oneAndHalf)) ∧
    ¬ strictEq (.number (.fraction oneAndHalf)) (.number (.fraction twoAndHalf)) ∧
    ¬ strictEq (.number (.fraction oneAndHalf)) (.number (.fraction oneAndQuarter)) ∧
    ¬ strictEq (.number .nan) (.number .nan) ∧
    strictEq (.number .negativeZero) (.number (.integer 0)) ∧
    strictEq (.number .positiveInfinity) (.number .positiveInfinity) ∧
    ¬ strictEq (.number .positiveInfinity) (.number .negativeInfinity) := by decide

end Nona.Switch
