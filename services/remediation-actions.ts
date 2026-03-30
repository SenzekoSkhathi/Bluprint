export interface IssueActionTarget {
  route: string;
  label: string;
}

export interface IssueActionHintInput {
  category: string;
  relatedCourseCode?: string;
  relatedTerm?: string;
}

export function getIssueActionHint({
  category,
  relatedCourseCode,
  relatedTerm,
}: IssueActionHintInput): string {
  if (category === "prerequisite") {
    if (relatedCourseCode) {
      return `Plan prerequisite courses before ${relatedCourseCode}.`;
    }
    return "Reorder planned courses so prerequisites come first.";
  }

  if (category === "sequencing") {
    return "Move dependent courses to a later term after prerequisites are completed.";
  }

  if (category === "credits") {
    return "Add future-term courses to close the remaining credit shortfall.";
  }

  if (category === "core-requirement") {
    return "Add the missing core requirement course to your plan.";
  }

  if (category === "major-requirement") {
    return "Add the missing required course(s) for your major to your plan.";
  }

  if (category === "graduation") {
    return "Add more courses to your plan to meet the graduation credit requirement.";
  }

  if (category === "load") {
    if (relatedTerm) {
      return `Rebalance credits in ${relatedTerm} by moving one course to another term.`;
    }
    return "Rebalance workload by moving one course to a lighter term.";
  }

  if (category === "schedule") {
    return "Adjust your timetable to remove overlaps and invalid session ranges.";
  }

  return "Update your plan and refresh validation until this issue clears.";
}

export function getIssueActionTarget(category: string): IssueActionTarget {
  if (category === "schedule") {
    return {
      route: "/(tabs)/schedule",
      label: "Open Schedule",
    };
  }

  if (category === "core-requirement" || category === "major-requirement") {
    return {
      route: "/(tabs)/majors",
      label: "View Majors",
    };
  }

  if (category === "graduation") {
    return {
      route: "/(tabs)/progress",
      label: "View Progress",
    };
  }

  return {
    route: "/(tabs)/planner",
    label: "Open Planner",
  };
}
