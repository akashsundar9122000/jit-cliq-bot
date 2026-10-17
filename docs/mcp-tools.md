# Cliq MCP — tools relevant to this project

Inspected 2026-10-17 via `node scripts/mcp.mjs dump` (300 tools total). The server URL is a credential and is not recorded here; it lives in local Claude config and `~/.jit-cliq/mcp.json`.

MCP is a development/verification channel only. The bot never calls it at runtime.

## Build (bots, functions, schedulers, datastores, widgets, commands, extensions)

- `ZohoCliq_add_bot_to_channel`
- `ZohoCliq_add_datastore_fields_v2`
- `ZohoCliq_add_or_update_extension_proper`
- `ZohoCliq_associate_bot_channel`
- `ZohoCliq_bulk_delete_datastore_records_v2`
- `ZohoCliq_bulk_update_datastore_records_v2`
- `ZohoCliq_create_bot`
- `ZohoCliq_create_bot_handler`
- `ZohoCliq_create_datastore_record_v2`
- `ZohoCliq_create_datastore_v2`
- `ZohoCliq_create_extension_handler`
- `ZohoCliq_create_function_handler_v2`
- `ZohoCliq_create_function_v2`
- `ZohoCliq_create_message_action_v2`
- `ZohoCliq_create_scheduler_v2`
- `ZohoCliq_create_slash_command_handler_v2`
- `ZohoCliq_create_slash_command_v2`
- `ZohoCliq_create_widget_v2`
- `ZohoCliq_delete_bot`
- `ZohoCliq_delete_bot_handler`
- `ZohoCliq_delete_datastore_fields_v2`
- `ZohoCliq_delete_datastore_record_v2`
- `ZohoCliq_delete_datastore_v2`
- `ZohoCliq_delete_extension_handler`
- `ZohoCliq_delete_extension_property`
- `ZohoCliq_delete_function_handler_v2`
- `ZohoCliq_delete_function_v2`
- `ZohoCliq_delete_message_action_v2`
- `ZohoCliq_delete_scheduler_v2`
- `ZohoCliq_delete_slash_command_handler_v2`
- `ZohoCliq_delete_slash_command_v2`
- `ZohoCliq_delete_widget_v2`
- `ZohoCliq_disable_scheduler_v2`
- `ZohoCliq_enable_scheduler_v2`
- `ZohoCliq_export_datastore_records_v2`
- `ZohoCliq_get_bot`
- `ZohoCliq_get_bot_handler`
- `ZohoCliq_get_datastore_record_v2`
- `ZohoCliq_get_datastore_v2`
- `ZohoCliq_get_extension_handler`
- `ZohoCliq_get_extension_property`
- `ZohoCliq_get_function_handler_v2`
- `ZohoCliq_get_function_v2`
- `ZohoCliq_get_message_action_handler_v2`
- `ZohoCliq_get_message_action_v2`
- `ZohoCliq_get_scheduler_handler_v2`
- `ZohoCliq_get_scheduler_v2`
- `ZohoCliq_get_slash_command_handler_v2`
- `ZohoCliq_get_slash_command_v2`
- `ZohoCliq_get_widget_handler_v2`
- `ZohoCliq_get_widget_v2`
- `ZohoCliq_install_an_extension`
- `ZohoCliq_list_bot_handler_executions`
- `ZohoCliq_list_bot_subscribers`
- `ZohoCliq_list_bots`
- `ZohoCliq_list_datastore_records_v2`
- `ZohoCliq_list_datastores_v2`
- `ZohoCliq_list_extension_handler_executions`
- `ZohoCliq_list_extension_properties`
- `ZohoCliq_list_functions_v2`
- `ZohoCliq_list_message_actions_v2`
- `ZohoCliq_list_scheduler_handler_executions_v2`
- `ZohoCliq_list_schedulers_v2`
- `ZohoCliq_list_slash_command_handler_executions_v2`
- `ZohoCliq_list_slash_commands_v2`
- `ZohoCliq_list_widget_handler_executions_v2`
- `ZohoCliq_list_widgets_v2`
- `ZohoCliq_send_bot_message`
- `ZohoCliq_send_bot_webhook_message`
- `ZohoCliq_send_message_to_bot`
- `ZohoCliq_trigger_bot_call`
- `ZohoCliq_update_bot`
- `ZohoCliq_update_bot_handler`
- `ZohoCliq_update_datastore_fields_v2`
- `ZohoCliq_update_datastore_record_v2`
- `ZohoCliq_update_datastore_v2`
- `ZohoCliq_update_extension`
- `ZohoCliq_update_extension_handler`
- `ZohoCliq_update_function_handler_v2`
- `ZohoCliq_update_function_v2`
- `ZohoCliq_update_message_action_handler_v2`
- `ZohoCliq_update_message_action_v2`
- `ZohoCliq_update_scheduler_handler_v2`
- `ZohoCliq_update_scheduler_v2`
- `ZohoCliq_update_slash_command_handler_v2`
- `ZohoCliq_update_slash_command_v2`
- `ZohoCliq_update_widget_handler_v2`
- `ZohoCliq_update_widget_v2`

## Channel membership

- `ZohoCliq_add_bot_to_channel`
- `ZohoCliq_add_channel_members`
- `ZohoCliq_get_channel`
- `ZohoCliq_list_channel_members`
- `ZohoCliq_list_channels`
- `ZohoCliq_remove_channel_member`
- `ZohoCliq_remove_channel_members`
- `ZohoCliq_update_channel_member_role`

## Users

- `ZohoCliq_add_role_users`
- `ZohoCliq_get_user`
- `ZohoCliq_list_role_users`
- `ZohoCliq_list_users`
- `ZohoCliq_mention_user`
- `ZohoCliq_remove_role_users`
- `ZohoCliq_send_message_to_user`
- `ZohoCliq_unassign_reminder_user`
- `ZohoCliq_update_user`

## Not available via MCP

- Creating Cliq **Connections** (OAuth for `invokeurl`) — UI only.
- Running arbitrary Deluge directly; spikes run by messaging a bot (`ZohoCliq_send_message_to_bot`) and reading `ZohoCliq_list_bot_handler_executions`.
