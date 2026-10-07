import Lean
import Nona.MoveRules
import Nona.Examples

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
      `Nona.coalesce_correct, `Nona.run_congr, `Nona.optimizer_correct] do
    logInfo m!"{name}: axioms {(← collectAxioms name)}"
