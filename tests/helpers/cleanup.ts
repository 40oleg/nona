import {rmSync} from 'node:fs';

/**
 * Removes a test's temporary directory. On Windows an executable that has just
 * exited can stay locked for a moment (antivirus scanning, image unmapping),
 * which made rmSync fail with EPERM/EBUSY and turned a passing test red. The
 * removal is retried, and a directory that still cannot be removed is left to
 * the system's temporary-file cleanup instead of failing the test.
 */
export function removeTemporaryDirectory(directory:string):void {
  try {
    rmSync(directory,{recursive:true,force:true,maxRetries:10,retryDelay:100});
  } catch (error) {
    const code=(error as NodeJS.ErrnoException).code;
    if (code!=='EPERM'&&code!=='EBUSY'&&code!=='ENOTEMPTY') throw error;
  }
}
