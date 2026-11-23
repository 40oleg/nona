import Lean
import Nona.MoveRules
import Nona.ProductionMoves
import Nona.Examples
import Nona.Numeric
import Nona.FractionIdentity
import Nona.SwitchIndex
import Nona.SwitchEquality
import Nona.SwitchDispatch
import Nona.SwitchWitnesses

open Lean Elab Command

-- Check transitive proof dependencies, not just source text. Standard Lean
-- logical axioms are allowed; proof holes and project-defined axioms are not.
run_cmd do
  let allowed := #[`propext, `Classical.choice, `Quot.sound]
  let env ← getEnv
  for (name, info) in env.checked.get.constants.toList do
    if name.getRoot == `Nona then
      if let .axiomInfo axiomValue := info then
        -- The compiler creates unsafe erased-lambda declarations. They cannot
        -- justify a checked theorem; transitive dependency checks still apply.
        unless axiomValue.isUnsafe do
          throwError "Project axiom is forbidden: {name}"
      if let .thmInfo _ := info then
        for dependency in (← collectAxioms name) do
          unless allowed.contains dependency do
            throwError "Unapproved axiom in {name}: {dependency}"
  for name in #[`Nona.substitute_correct, `Nona.dead_write_correct,
      `Nona.coalesce_correct, `Nona.run_congr, `Nona.optimizer_correct,
      `Nona.Production.forward_block_correct, `Nona.Production.block_terminator_correct,
      `Nona.Production.transfer_correct, `Nona.Production.continuation_correct,
      `Nona.Production.dead_producer_continuation,
      `Nona.Production.coalesce_producer_continuation,
      `Nona.Production.eliminate_correct, `Nona.Production.bounded_dce_correct,
      `Nona.Numeric.admission_exact, `Nona.Numeric.signExtend32_fixed,
      `Nona.Numeric.admission_finite_integral_range,
      `Nona.Numeric.remainder_eligibility,
      `Nona.Numeric.remainder_decomposition, `Nona.Numeric.remainder_bounds,
      `Nona.Numeric.division_fits, `Nona.Numeric.remainder_zero_sign,
      `Nona.Numeric.division_result_correct, `Nona.Numeric.dynamic_fast_path_correct,
      `Nona.Numeric.integer_remainder_zero_sign, `Nona.Numeric.guarded_toInt32,
      `Nona.Numeric.static_guard_exact, `Nona.Numeric.number_static_guard_exact,
      `Nona.Numeric.static_mask_remainder, `Nona.Numeric.static_mask_number,
      `Nona.Numeric.static_fast_path_correct,
      `Nona.Numeric.fraction_identity, `Nona.Numeric.numberEq_fraction_iff,
      `Nona.Switch.strict_number_correct, `Nona.Switch.strict_equality_correct,
      `Nona.Switch.first_key_correct, `Nona.Switch.constructed_lookup,
      `Nona.Switch.distinct_keys_unique, `Nona.Switch.constructed_key_coverage,
      `Nona.Switch.constructed_interval, `Nona.SwitchIndex.unsigned_index_exact,
      `Nona.Switch.admitted_interval, `Nona.Switch.admitted_offset_exact,
      `Nona.Switch.table_admission_exact,
      `Nona.Switch.all_chain_correct, `Nona.Switch.table_chain_correct,
      `Nona.Switch.selected_dispatch_correct, `Nona.Switch.selected_continuation_correct,
      `Nona.Switch.missing_literal_guard_counterexample,
      `Nona.Switch.faulty_fraction_equality_counterexample,
      `Nona.Switch.lost_fraction_identity_counterexample,
      `Nona.Switch.signed_index_counterexample] do
    logInfo m!"{name}: axioms {(← collectAxioms name)}"
