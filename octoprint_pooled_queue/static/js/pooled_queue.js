/*jslint esversion: 9 */
/*global $,OctoPrint,OCTOPRINT_VIEWMODELS,UI_API_KEY,OctoPrintPool_Queue */

/*
 * View model for OctoPrint-Pooled_Queue
 *
 * Author: Seth Battis
 * License: AGPLv3
 */
$(function () {
    "use strict";
    const PLUGIN_ID = 'pooled_queue';

    const PLUGIN_SELECTOR = `#plugin_${PLUGIN_ID}`;
    const BINDINGS = {
        [`${PLUGIN_SELECTOR}_button`]: 'button',
        [`${PLUGIN_SELECTOR}_button_text`]: 'button_text',

        [`${PLUGIN_SELECTOR}_dialog`]: 'dialog',
        [`${PLUGIN_SELECTOR}_dialog_title`]: 'dialog_title',
        [`${PLUGIN_SELECTOR}_instructions`]: 'instructions',

        [`${PLUGIN_SELECTOR}_files_none`]: 'files_none',
        [`${PLUGIN_SELECTOR}_files_auth`]: 'files_auth',
        [`${PLUGIN_SELECTOR}_files_config`]: 'files_config',
        [`${PLUGIN_SELECTOR}_files_loading`]: 'files_loading',
        [`${PLUGIN_SELECTOR}_files_list`]: 'files_list',

        [`${PLUGIN_SELECTOR}_item_template`]: 'item_template'
    };

    const KEY = {
        oauth2_client_id: 'oauth2_client_id',
        oauth2_client_secret: 'oauth2_client_secret',
        access_token: 'access_token',
        access_token_expiration: 'access_token_expiration',
        refresh_token: 'refresh_token',
        pool_url: 'pool_url',

        field_id: 'field_id',
        field_filename: 'field_filename',
        field_tags: 'field_tags',
        field_date: 'field_date',
        field_comment: 'field_comment',

        label_button_text: 'label_button_text',
        label_dialog_title: 'label_dialog_title',
        label_dialog_instructions: 'label_dialog_instructions',

        upload_path: 'upload_path',
        upload_include_comment: 'upload_include_comment',
        upload_print: 'upload_print',
        upload_select: 'upload_select'
    };

    function PooledQueueViewModel() {

        const self = this;

        self.button = undefined;
        self.button_text = undefined;

        self.dialog = undefined;
        self.dialog_title = undefined;
        self.instructions = undefined;

        self.files_none = undefined;
        self.files_config = undefined;
        self.files_auth = undefined;
        self.files_loading = undefined;
        self.files_list = undefined;

        self.item_template = undefined;

        self.queue = undefined;

        self.filesContent = desiredView => {
            for(const view of [
                self.files_none,
                self.files_config,
                self.files_auth,
                self.files_loading,
                self.files_list
            ]) {
                if (view === desiredView) {
                    view.classList.remove('hidden');
                } else {
                    view.classList.add('hidden');
                }
            }
        };

        async function selectItem(item, settings) {
            $(self.dialog).modal('hide');

            const OCTOPRINT_API_CALL_TEMPLATE = {};
            if (UI_API_KEY) {
                OCTOPRINT_API_CALL_TEMPLATE.headers = {'X-Api-Key': UI_API_KEY};
            }

            /**
             * https://stackoverflow.com/a/46427607
             */
            const build_path = (...args) => {
                return args.map((part, i) => {
                    if (i === 0) {
                        return String(part).trim().replace(/[\/]*$/g, '');
                    } else {
                        return String(part).trim().replace(/(^[\/]*|[\/]*$)/g, '');
                    }
                }).filter(x => x.length).join('/');
            };

            const file = await self.queue.dequeue(item.id);
            const data = new FormData();
            data.append('print', settings[KEY.upload_print]);
            data.append('select', settings[KEY.upload_select]);

            const userdata = {};
            if (item[settings[KEY.field_tags]]) {
                userdata.tags = item[settings[KEY.field_tags]];
            }
            if (settings[KEY.upload_include_comment] && item[settings[KEY.field_comment]]) {
                userdata.comment = item[settings[KEY.field_comment]];
            }
            if (userdata.comment || userdata.tags) {
                data.append('userdata', JSON.stringify(userdata));
            }

            data.append('file', file, item[settings[KEY.field_filename]]);
            $.ajax({
                ...OCTOPRINT_API_CALL_TEMPLATE,
                url: build_path('/api/files', settings[KEY.upload_path]),
                method: 'POST',
                data,
                processData: false,
                contentType: false,
            });
        }

        function addItem(item, settings) {
            const node = self.item_template.content.firstElementChild.cloneNode(true);
            // TODO lose this janky-ness
            const fields = {
                id: 'field_id',
                filename: 'field_filename',
                tags: 'field_tags',
                date: 'field_date',
                comment: 'field_comment'
            };
            for (const field in fields) {
                if (settings[fields[field]] && item[settings[fields[field]]]) {
                    if (field === 'date') {
                        item[settings[fields[field]]] = new Date(item[settings[fields[field]]]).toDateString();
                    }
                    node.querySelector(`.${field}`).innerHTML += item[settings[fields[field]]];
                } else {
                    node.querySelector(`.${field}`).classList.add('hidden');
                }
            }
            node.addEventListener('click', selectItem.bind(self, item, settings));
            return self.files_list.querySelector('ul').appendChild(node);
        }

        self.showDialog = async function (settings) {
            self.filesContent(self.files_loading);

            $(self.dialog).modal('show');
            if (settings[KEY.pool_url]) {
                const files = await self.queue.list();
                if (files.length > 0) {
                    self.files_list.querySelector('ul').innerHTML = null;
                    for (const item of files) {
                        addItem(item, settings);
                    }
                    self.filesContent(self.files_list);
                } else {
                    self.filesContent(self.files_none);
                }
            } else {
                self.filesContent(self.files_config);
            }
        };

        /***************************************************************************************************************
         * Lifecycle event handlers
         */

        self.onBoundTo = function (target, element) {
            self[BINDINGS[target]] = element;
        };

        async function applySettings() {
            const settings = await OctoPrint.settings.getPluginSettings(PLUGIN_ID);
            self.button_text.innerHTML = settings[KEY.label_button_text];
            self.instructions.innerHTML = settings[KEY.label_dialog_instructions];
            self.dialog_title.innerHTML = settings[KEY.label_dialog_title];
            self.button.addEventListener('click', self.showDialog.bind(self, settings));
            self.queue = new OctoPrintPool_Queue({
                plugin_id: PLUGIN_ID,
                pool_url: settings[KEY.pool_url],
                client_id: settings[KEY.oauth2_client_id],
                client_secret: settings[KEY.oauth2_client_secret]
            });
        }

        self.onStartupComplete = function () {
            document.querySelector('.upload-buttons').append(self.button);
            for (const button of document.querySelectorAll('.upload-buttons .fileinput-button')) {
                button.classList.remove('span12');
                button.classList.add('span6');
            }
            // noinspection JSIgnoredPromiseFromCall
            applySettings();
        };
    }

    OCTOPRINT_VIEWMODELS.push({
        construct: PooledQueueViewModel,
        elements: Object.keys(BINDINGS) // TODO do we really need to bind _everything_?
    });
});
