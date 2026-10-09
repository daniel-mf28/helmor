use anyhow::Result;

use crate::forge::github;

use super::types::{ChangeRequestInfo, ForgeActionStatus, ForgeProvider};

/// Per-provider backend for workspace-scoped forge ops.
pub(crate) trait WorkspaceForgeBackend {
    // Workspace-scoped
    fn lookup_change_request(&self, workspace_id: &str) -> Result<Option<ChangeRequestInfo>>;
    fn action_status(&self, workspace_id: &str) -> Result<ForgeActionStatus>;
    fn check_insert_text(&self, workspace_id: &str, item_id: &str) -> Result<String>;
    fn merge_change_request(&self, workspace_id: &str) -> Result<Option<ChangeRequestInfo>>;
    fn close_change_request(&self, workspace_id: &str) -> Result<Option<ChangeRequestInfo>>;
}

struct GithubBackend;

impl WorkspaceForgeBackend for GithubBackend {
    fn lookup_change_request(&self, workspace_id: &str) -> Result<Option<ChangeRequestInfo>> {
        github::lookup_workspace_pr(workspace_id)
    }

    fn action_status(&self, workspace_id: &str) -> Result<ForgeActionStatus> {
        github::lookup_workspace_pr_action_status(workspace_id)
    }

    fn check_insert_text(&self, workspace_id: &str, item_id: &str) -> Result<String> {
        github::lookup_workspace_pr_check_insert_text(workspace_id, item_id)
    }

    fn merge_change_request(&self, workspace_id: &str) -> Result<Option<ChangeRequestInfo>> {
        github::merge_workspace_pr(workspace_id)
    }

    fn close_change_request(&self, workspace_id: &str) -> Result<Option<ChangeRequestInfo>> {
        github::close_workspace_pr(workspace_id)
    }
}

static GITHUB_BACKEND: GithubBackend = GithubBackend;

pub(crate) fn backend_for(provider: ForgeProvider) -> Option<&'static dyn WorkspaceForgeBackend> {
    match provider {
        ForgeProvider::Github => Some(&GITHUB_BACKEND),
        ForgeProvider::Unknown => None,
    }
}
