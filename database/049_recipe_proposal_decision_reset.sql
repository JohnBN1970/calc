ALTER TABLE calc_recipe_proposal_decisions
  MODIFY decision ENUM('accepted','rejected','reset') NOT NULL;
