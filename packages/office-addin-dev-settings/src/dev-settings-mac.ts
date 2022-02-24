// copyright (c) Microsoft Corporation. All rights reserved.
// licensed under the MIT license.

import * as fs from "fs-extra";
import * as junk from "junk";
import {
  exportMetadataPackage,
  getOfficeApps,
  getOfficeAppsForManifestHosts,
  OfficeApp,
  OfficeAddinManifest,
} from "office-addin-manifest";
import * as os from "os";
import * as path from "path";
import { RegisteredAddin } from "./dev-settings";
import { ExpectedError } from "office-addin-usage-data";
import { publish } from "./publish";

export async function getRegisteredAddIns(): Promise<RegisteredAddin[]> {
  const registeredAddins: RegisteredAddin[] = [];

  for (const app of getOfficeApps()) {
    const sideloadDirectory = getSideloadDirectory(app);

    if (sideloadDirectory && fs.existsSync(sideloadDirectory)) {
      for (const fileName of fs.readdirSync(sideloadDirectory).filter(junk.not)) {
        const manifestPath = fs.realpathSync(path.join(sideloadDirectory, fileName));
        const manifest = await OfficeAddinManifest.readManifestFile(manifestPath);
        registeredAddins.push(new RegisteredAddin(manifest.id || "", manifestPath));
      }
    }
  }

  return registeredAddins;
}

function getSideloadDirectory(app: OfficeApp): string | undefined {
  switch (app) {
    case OfficeApp.Excel:
      return path.join(os.homedir(), "Library/Containers/com.microsoft.Excel/Data/Documents/wef");
    case OfficeApp.PowerPoint:
      return path.join(os.homedir(), "Library/Containers/com.microsoft.Powerpoint/Data/Documents/wef");
    case OfficeApp.Word:
      return path.join(os.homedir(), "Library/Containers/com.microsoft.Word/Data/Documents/wef");
  }
}

export async function registerAddIn(manifestPath: string, officeApps?: OfficeApp[]) {
  try {
    const manifest = await OfficeAddinManifest.readManifestFile(manifestPath);

    if (!officeApps) {
      officeApps = getOfficeAppsForManifestHosts(manifest.hosts);

      if (officeApps.length === 0) {
        throw new ExpectedError("The manifest file doesn't specify any hosts for the Office Add-in.");
      }
    }

    if (!manifest.id) {
      throw new ExpectedError("The manifest file doesn't contain the id of the Office Add-in.");
    }

    if (manifestPath.endsWith(".json")) {
      const zipPath: string = await exportMetadataPackage(manifestPath);
      return publish(zipPath);
    } else if (manifestPath.endsWith(".xml")) {
      for (const app of officeApps) {
        const sideloadDirectory = getSideloadDirectory(app);

        if (sideloadDirectory) {
          // include manifest id in sideload filename
          const sideloadPath = path.join(sideloadDirectory, `${manifest.id}.${path.basename(manifestPath)}`);

          fs.ensureDirSync(sideloadDirectory);
          fs.ensureLinkSync(manifestPath, sideloadPath);
        }
      }
    }
  } catch (err) {
    throw new Error(`Unable to register the Office Add-in.\n${err}`);
  }
}

export async function unregisterAddIn(manifestPath: string): Promise<void> {
  const manifest = await OfficeAddinManifest.readManifestFile(manifestPath);

  if (!manifest.id) {
    throw new ExpectedError("The manifest file doesn't contain the id of the Office Add-in.");
  }

  const registeredAddIns = await getRegisteredAddIns();

  for (const registeredAddIn of registeredAddIns) {
    const registeredFileName = path.basename(registeredAddIn.manifestPath);
    const manifestFileName = path.basename(manifestPath);
    const sideloadFileName = `${manifest.id!}.${manifestFileName}`;
    if (registeredFileName === manifestFileName || registeredFileName === sideloadFileName) {
      fs.unlinkSync(registeredAddIn.manifestPath);
    }
  }
}

export async function unregisterAllAddIns(): Promise<void> {
  const registeredAddIns = await getRegisteredAddIns();

  for (const registeredAddIn of registeredAddIns) {
    fs.unlinkSync(registeredAddIn.manifestPath);
  }
}
