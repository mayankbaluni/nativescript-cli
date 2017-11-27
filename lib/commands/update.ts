import * as path from "path";

export class UpdateCommand implements ICommand {
	public allowedParameters: ICommandParameter[] = [];

	constructor(private $options: IOptions,
		private $projectData: IProjectData,
		private $platformService: IPlatformService,
		private $platformsData: IPlatformsData,
		private $pluginsService: IPluginsService,
		private $projectDataService: IProjectDataService,
		private $fs: IFileSystem,
		private $logger: ILogger) {
		this.$projectData.initializeProjectData();
	}

	private folders: string[] = ["lib", "hooks", "platforms", "node_modules"];
	private tempFolder: string = ".tmp_backup";

	public async execute(args: string[]): Promise<void> {
		const tmpDir = path.join(this.$projectData.projectDir, this.tempFolder);

		try {
			this.backup(tmpDir);
		} catch (error) {
			this.$logger.error("Could not backup project folders!");
			this.$fs.deleteDirectory(tmpDir);
			return;
		}

		try {
			await this.executeCore(args);
		} catch (error) {
			this.restoreBackup(tmpDir);
			this.$logger.error("Could not update the project!");
		} finally {
			this.$fs.deleteDirectory(tmpDir);
		}
	}

	public async canExecute(args: string[]): Promise<boolean> {
		const platforms = this.getPlatforms();

		for (const platform of platforms.packagePlatforms) {
			const platformData = this.$platformsData.getPlatformData(platform, this.$projectData);
			const platformProjectService = platformData.platformProjectService;
			await platformProjectService.validate(this.$projectData);
		}

		return args.length < 2 && this.$projectData.projectDir !== "";
	}

	private async executeCore(args: string[]): Promise<void> {
		const platforms = this.getPlatforms();

		for (const platform of _.xor(platforms.installed, platforms.packagePlatforms)) {
			const platformData = this.$platformsData.getPlatformData(platform, this.$projectData);
			this.$projectDataService.removeNSProperty(this.$projectData.projectDir, platformData.frameworkPackageName);
		}

		await this.$platformService.removePlatforms(platforms.installed, this.$projectData);
		await this.$pluginsService.remove("tns-core-modules", this.$projectData);
		await this.$pluginsService.remove("tns-core-modules-widgets", this.$projectData);

		for (const folder of this.folders) {
			this.$fs.deleteDirectory(path.join(this.$projectData.projectDir, folder));
		}

		if (args.length === 1) {
			for (const platform of platforms.packagePlatforms) {
				await this.$platformService.addPlatforms([platform + "@" + args[0]], this.$options.platformTemplate, this.$projectData, this.$options, this.$options.frameworkPath);
			}

			await this.$pluginsService.add("tns-core-modules@" + args[0], this.$projectData);
		} else {
			await this.$platformService.addPlatforms(platforms.packagePlatforms, this.$options.platformTemplate, this.$projectData, this.$options, this.$options.frameworkPath);
			await this.$pluginsService.add("tns-core-modules", this.$projectData);
		}

		await this.$pluginsService.ensureAllDependenciesAreInstalled(this.$projectData);
	}

	private getPlatforms(): {installed: string[], packagePlatforms: string[]} {
		const installedPlatforms = this.$platformService.getInstalledPlatforms(this.$projectData);
		const availablePlatforms = this.$platformService.getAvailablePlatforms(this.$projectData);
		const packagePlatforms: string[] = [];

		for (const platform of availablePlatforms) {
			const platformData = this.$platformsData.getPlatformData(platform, this.$projectData);
			const platformVersion = this.$projectDataService.getNSValue(this.$projectData.projectDir, platformData.frameworkPackageName);
			if (platformVersion) {
				packagePlatforms.push(platform);
			}
		}

		return {
			installed: installedPlatforms,
			packagePlatforms: installedPlatforms.concat(packagePlatforms)
		};
	}

	private restoreBackup(tmpDir: string): void {
		this.$fs.copyFile(path.join(tmpDir, "package.json"), this.$projectData.projectDir);
		for (const folder of this.folders) {
			this.$fs.deleteDirectory(path.join(this.$projectData.projectDir, folder));

			const folderToCopy = path.join(tmpDir, folder);

			if (this.$fs.exists(folderToCopy)) {
				this.$fs.copyFile(folderToCopy, this.$projectData.projectDir);
			}
		}
	}

	private backup(tmpDir: string): void {
		this.$fs.deleteDirectory(tmpDir);
		this.$fs.createDirectory(tmpDir);
		this.$fs.copyFile(path.join(this.$projectData.projectDir, "package.json"), tmpDir);
		for (const folder of this.folders) {
			const folderToCopy = path.join(this.$projectData.projectDir, folder);
			if (this.$fs.exists(folderToCopy)) {
				this.$fs.copyFile(folderToCopy, tmpDir);
			}
		}
	}
}

$injector.registerCommand("update", UpdateCommand);
