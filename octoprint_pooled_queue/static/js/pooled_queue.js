/*
 * View model for OctoPrint-Pooled_Queue
 *
 * Author: Seth Battis
 * License: AGPLv3
 */
$(function () {
    const PLUGIN_ID = 'pooled_queue';

    const PLUGIN_SELECTOR = `#plugin_${PLUGIN_ID}`
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
    }

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

        const OCTOPRINT_API_CALL_TEMPLATE = {}
        if (UI_API_KEY) {
            OCTOPRINT_API_CALL_TEMPLATE.headers = {'X-Api-Key': UI_API_KEY};
        }

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
        }

        /**
         * https://stackoverflow.com/a/46427607
         */
        function build_path(...args) {
            return args.map((part, i) => {
                if (i === 0) {
                    return part.trim().replace(/[\/]*$/g, '')
                } else {
                    return part.trim().replace(/(^[\/]*|[\/]*$)/g, '')
                }
            }).filter(x => x.length).join('/')
        }

        async function saveAccessToken(tokenData) {
            tokenData = {
                access_token: undefined,
                expires_in: undefined,
                refresh_token: undefined,
                scope: undefined,
                token_type: undefined,
                ...tokenData
            };
            OctoPrint.settings.savePluginSettings(PLUGIN_ID, {
                access_token: tokenData.access_token,
                access_token_expiration: Date.now() + 1000 * tokenData.expires_in,
                refresh_token: tokenData.refresh_token
            });
            return tokenData.access_token;
        }

        async function refreshTokenGrant(settings) {
            return await saveAccessToken(
                await pooledQueueApiCall({
                    endpoint: `${settings[KEY.pool_url]}/api/v1/oauth2/token`,
                    method: 'POST',
                    body: {
                        grant_type: 'refresh_token',
                        refresh_token: settings[KEY.refresh_token],
                        client_id: settings[KEY.oauth2_client_id],
                        client_secret: settings[KEY.oauth2_client_secret]
                    },
                    requiresAuthorizationHeader: false
                })
            );
        }

        async function authorizationCodeGrant(settings) {
            const state = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
            const redirect_uri = new URL(`${settings[KEY.pool_url]}/api/v1/oauth2/state/${state}`);
            const authorizationRequest = {
                response_type: 'code',
                client_id: settings[KEY.oauth2_client_id],
                redirect_uri: redirect_uri.pathname,
                state: state
            };
            const authForm = document.createElement('form');
            authForm.target = '_blank';
            authForm.method = 'GET';
            authForm.action = `${settings[KEY.pool_url]}/api/v1/oauth2/authorize`
            for (const field in authorizationRequest) {
                authForm.innerHTML += `<input type="hidden" name="${field}" value="${authorizationRequest[field]}">`
            }
            document.body.appendChild(authForm);
            authForm.submit();
            // TODO throw up modal message explaining that the auth form should be in another tab
            document.body.removeChild(authForm);

            const authorization = {
                authorization_code: undefined,
                expires: undefined,
                state: undefined,
                ...await pooledQueueApiCall({
                    endpoint: redirect_uri,
                    requiresAuthorizationHeader: false
                })
            }

            return await saveAccessToken(
                await pooledQueueApiCall({
                    endpoint: `${settings[KEY.pool_url]}/api/v1/oauth2/token`,
                    method: 'POST',
                    body: {
                        grant_type: 'authorization_code',
                        code: authorization.authorization_code,
                        client_id: settings[KEY.oauth2_client_id],
                        client_secret: settings[KEY.oauth2_client_secret],
                        redirect_uri: redirect_uri.pathname
                    },
                    requiresAuthorizationHeader: false
                })
            );
        }

        async function accessToken() {
            // TODO handle authentication failures
            const settings = await OctoPrint.settings.getPluginSettings(PLUGIN_ID);
            if (settings[KEY.access_token] && settings[KEY.access_token_expiration] > Date.now() - (30 * 1000)) { // 30 second buffer on expiry
                return settings[KEY.access_token];
            }

            if (settings[KEY.refresh_token]) {
                return await refreshTokenGrant(settings);
            }

            if (settings[KEY.pool_url]) {
                return await authorizationCodeGrant(settings);
            }
        }

        async function pooledQueueApiCall(request = {}) {
            // apply default properties
            request = {
                method: 'GET',
                headers: {},
                requiresAuthorizationHeader: true,
                returnJson: true,
                ...request
            }

            if (request.endpoint === undefined) {
                throw "request.endpoint undefined";
            }

            // convert body object to FormData object for API
            if (request.body !== undefined && false === FormData.isPrototypeOf(request.body)) {
                const formData = new FormData();
                for (const prop of Object.keys(request.body)) {
                    formData.append(prop, request.body[prop]);
                }
                request.body = formData;
            }
            if (request.requiresAuthorizationHeader) {
                request.headers.Authorization = `Bearer ${await accessToken()}`;
            }

            // TODO deal with failed requests
            const response = await fetch(request.endpoint, {
                method: request.method,
                headers: request.headers,
                credentials: 'include',
                body: request.body
            });
            if (request.returnJson) {
                return await response.json();
            }
            return response;
        }

        async function selectItem(item, settings) {
            $(self.dialog).modal('hide');

            const file = await (
                await pooledQueueApiCall({
                    endpoint: `${settings[KEY.pool_url]}/api/v1/queue/${item.id}`,
                    method: 'DELETE',
                    returnJson: false
                })
            ).blob();
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
            // TODO lose this jankiness
            const fields = {
                id: 'field_id',
                filename: 'field_filename',
                tags: 'field_tags',
                date: 'field_date',
                comment: 'field_comment'
            }
            for (const field in fields) {
                if (settings[fields[field]] && item[settings[fields[field]]]) {
                    if (field === 'date') {
                        item[settings[fields[field]]] = new Date(item[settings[fields[field]]]).toDateString();
                    }
                    node.querySelector(`.${field}`).innerHTML += item[settings[fields[field]]];
                } else {
                    node.querySelector(`.${field}`).classList.add('hidden')
                }
            }
            node.addEventListener('click', selectItem.bind(self, item, settings))
            return self.files_list.querySelector('ul').appendChild(node);
        }

        self.showDialog = async function (settings) {
            self.filesContent(self.files_loading);

            $(self.dialog).modal('show')
            if (settings[KEY.pool_url]) {
                const files = await pooledQueueApiCall({
                    endpoint: `${settings[KEY.pool_url]}/api/v1/queue`
                });
                self.files_list.querySelector('ul').innerHTML = null;
                for (const item of files) {
                    addItem(item, settings);
                }
                self.filesContent(self.files_list);
            } else {
                self.filesContent(self.files_config);
            }
        }

        /***************************************************************************************************************
         * Lifecycle event handlers
         */

        self.onBoundTo = function (target, element) {
            self[BINDINGS[target]] = element;
        }

        async function applySettings() {
            const settings = await OctoPrint.settings.getPluginSettings(PLUGIN_ID);
            self.button_text.innerHTML = settings[KEY.label_button_text];
            self.instructions.innerHTML = settings[KEY.label_dialog_instructions];
            self.dialog_title.innerHTML = settings[KEY.label_dialog_title];
            self.button.addEventListener('click', self.showDialog.bind(self, settings));
        }

        self.onStartupComplete = function () {
            document.querySelector('.upload-buttons').append(self.button);
            for (const button of document.querySelectorAll('.upload-buttons .fileinput-button')) {
                button.classList.remove('span12');
                button.classList.add('span6');
            }
            // noinspection JSIgnoredPromiseFromCall
            applySettings();
        }
    }

    OCTOPRINT_VIEWMODELS.push({
        construct: PooledQueueViewModel,
        elements: Object.keys(BINDINGS) // TODO do we really need to bind _everything_?
    });
});
