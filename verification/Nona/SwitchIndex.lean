import Std

namespace Nona.SwitchIndex

/-- A 64-bit SUB followed by an unsigned comparison selects exactly the
half-open table interval when both endpoints fit the signed word domain
(the exclusive upper bound may be one past the largest signed word). -/
theorem unsigned_index_exact (value low span : Int)
    (vmin : -9223372036854775808 ≤ value) (vmax : value < 9223372036854775808)
    (lmin : -9223372036854775808 ≤ low) (nonneg : 0 ≤ span)
    (upper : low + span ≤ 9223372036854775808) :
    (value - low) % 18446744073709551616 < span ↔
      low ≤ value ∧ value < low + span := by
  by_cases before : value < low
  · have wrapped : (value - low) % 18446744073709551616 =
        value - low + 18446744073709551616 := by omega
    rw [wrapped]
    omega
  · have unchanged : (value - low) % 18446744073709551616 = value - low :=
      Int.emod_eq_of_lt (by omega) (by omega)
    rw [unchanged]
    omega

example : (0 - 1 : Int) < 4 ∧ ¬ ((0 - 1 : Int) % 18446744073709551616 < 4) := by decide
example : ¬ ((-9223372036854775808 - 1 : Int) % 18446744073709551616 < 4) := by decide

end Nona.SwitchIndex
