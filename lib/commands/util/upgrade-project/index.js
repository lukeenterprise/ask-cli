const path = require('path');

const { AbstractCommand } = require('@src/commands/abstract-command');
const optionModel = require('@src/commands/option-model');
const ResourcesConfig = require('@src/model/resources-config');
const Messenger = require('@src/view/messenger');
const profileHelper = require('@src/utils/profile-helper');
const CONSTANTS = require('@src/utils/constants');

const helper = require('./helper');
const hostedSkillHelper = require('./hosted-skill-helper');

class UpgradeProjectCommand extends AbstractCommand {
    name() {
        return 'upgrade-project';
    }

    description() {
        return 'upgrade the v1 ask-cli skill project to v2 structure';
    }

    requiredOptions() {
        return [];
    }

    optionalOptions() {
        return ['profile', 'debug'];
    }

    handle(cmd, cb) {
        // 1.confirm project is upgrade-able
        let profile, upgradeInfo;
        try {
            profile = profileHelper.runtimeProfile(cmd.profile);
            upgradeInfo = helper.extractUpgradeInformation(process.cwd(), profile);
        } catch (checkErr) {
            Messenger.getInstance().error(checkErr);
            return cb(checkErr);
        }
        // 2.preview new project structure
        helper.previewUpgrade(upgradeInfo, (previewErr, previewConfirm) => {
            if (previewErr) {
                Messenger.getInstance().error(previewErr);
                return cb(previewErr);
            }
            if (!previewConfirm) {
                Messenger.getInstance().info('Command upgrade-project aborted.');
                return cb();
            }
            // 3.create v2 project based on the upgrade info
            if (upgradeInfo.isHosted) {
                _createV2HostedSkillProject(upgradeInfo, profile, cmd.debug, (v2Err) => {
                    if (v2Err) {
                        Messenger.getInstance().error(v2Err);
                        return cb(v2Err);
                    }
                    Messenger.getInstance().info('Project migration finished.');
                    cb();
                });
            } else {
                _createV2NonHostedSkillProject(upgradeInfo, profile, cmd.debug, (v2Err) => {
                    if (v2Err) {
                        Messenger.getInstance().error(v2Err);
                        return cb(v2Err);
                    }
                    Messenger.getInstance().info('Project migration finished.');
                    cb();
                });
            }
        });
    }
}

function _createV2HostedSkillProject(upgradeInfo, profile, doDebug, callback) {
    const rootPath = process.cwd();
    const { skillId } = upgradeInfo;
    try {
        // 1.move v1 skill project content into legacy folder
        helper.moveOldProjectToLegacyFolder(rootPath);
        // 2.instantiate MVC and ask-resource config
        hostedSkillHelper.createV2ProjectSkeleton(rootPath, skillId, profile);
        new ResourcesConfig(path.join(rootPath, CONSTANTS.FILE_PATH.ASK_RESOURCES_JSON_CONFIG));
    } catch (initProjErr) {
        return callback(initProjErr);
    }
    // 3.import skill metadata from skillId
    hostedSkillHelper.downloadSkillPackage(rootPath, skillId, CONSTANTS.SKILL.STAGE.DEVELOPMENT, profile, doDebug, (packageErr) => {
        if (packageErr) {
            return callback(packageErr);
        }
        // 4.copy Lambda code to skill code and delete old project
        try {
            hostedSkillHelper.handleExistingLambdaCode(rootPath, profile);
            callback();
        } catch (codeErr) {
            callback(codeErr);
        }
    });
}

function _createV2NonHostedSkillProject(upgradeInfo, profile, doDebug, callback) {
    const rootPath = process.cwd();
    const { skillId, lambdaResources } = upgradeInfo;
    try {
        // 1.move v1 skill project content into legacy folder
        helper.moveOldProjectToLegacyFolder(rootPath);
        // 2.instantiate MVC and ask-resource config
        helper.createV2ProjectSkeleton(rootPath, skillId, profile);
        new ResourcesConfig(path.join(rootPath, CONSTANTS.FILE_PATH.ASK_RESOURCES_JSON_CONFIG));
    } catch (initProjErr) {
        return callback(initProjErr);
    }

    // 3.import skill metadata from skillId
    helper.downloadSkillPackage(rootPath, skillId, CONSTANTS.SKILL.STAGE.DEVELOPMENT, profile, doDebug, (packageErr) => {
        if (packageErr) {
            return callback(packageErr);
        }
        // 4.copy Lambda code to skill code
        try {
            helper.handleExistingLambdaCode(rootPath, lambdaResources, profile);
            callback();
        } catch (codeErr) {
            callback(codeErr);
        }
    });
}

module.exports = UpgradeProjectCommand;
module.exports.createCommand = new UpgradeProjectCommand(optionModel).createCommand();