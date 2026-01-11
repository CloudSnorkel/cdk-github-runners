import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { Architecture, GitHubRunners, LambdaRunnerProvider, Os, RunnerImageComponent } from '../src';

const testCertificatesDir = path.join(__dirname, 'certificates');

describe('Certificate handling', () => {
  describe('RunnerImageComponent.extraCertificates', () => {
    describe('single file support', () => {
      test('should work with a single .pem file', () => {
        const certFile = path.join(testCertificatesDir, 'single-cert.pem');

        const comp = RunnerImageComponent.extraCertificates(certFile, 'test-cert');

        expect(comp.name).toBe('Extra-Certificates-test-cert');

        const assets = comp.getAssets(Os.LINUX_UBUNTU, Architecture.X86_64);
        expect(assets).toHaveLength(1);
        expect(assets[0].source).toBe(certFile);
        expect(assets[0].target).toBe('/usr/local/share/ca-certificates/test-cert-0.crt');
      });

      test('should work with a single .crt file', () => {
        const certFile = path.join(testCertificatesDir, 'cert3.crt');

        const comp = RunnerImageComponent.extraCertificates(certFile, 'test-cert');

        const assets = comp.getAssets(Os.LINUX_AMAZON_2023, Architecture.X86_64);
        expect(assets).toHaveLength(1);
        expect(assets[0].target).toBe('/etc/pki/ca-trust/source/anchors/test-cert-0.crt');
      });

      test('should work with Windows', () => {
        const certFile = path.join(testCertificatesDir, 'single-cert.pem');

        const comp = RunnerImageComponent.extraCertificates(certFile, 'test-cert');

        const commands = comp.getCommands(Os.WINDOWS, Architecture.X86_64);
        expect(commands).toContain('Import-Certificate -FilePath C:\\test-cert-0.crt -CertStoreLocation Cert:\\LocalMachine\\Root');
        expect(commands).toContain('Remove-Item C:\\test-cert-0.crt');

        const assets = comp.getAssets(Os.WINDOWS, Architecture.X86_64);
        expect(assets).toHaveLength(1);
        expect(assets[0].target).toBe('C:\\test-cert-0.crt');
      });
    });

    describe('directory support', () => {
      test('should find all .pem files in directory', () => {
        const certDir = path.join(testCertificatesDir, 'mixed-certs');

        const comp = RunnerImageComponent.extraCertificates(certDir, 'test-certs');

        const assets = comp.getAssets(Os.LINUX_UBUNTU, Architecture.X86_64);
        // Should find a-cert.pem, cert.crt, m-cert.pem, z-cert.pem (4 files)
        expect(assets).toHaveLength(4);
      });

      test('should sort certificate files consistently', () => {
        const certDir = path.join(testCertificatesDir, 'mixed-certs');

        const comp = RunnerImageComponent.extraCertificates(certDir, 'test-certs');

        const assets = comp.getAssets(Os.LINUX_UBUNTU, Architecture.X86_64);
        expect(assets).toHaveLength(4);
        // Should be sorted alphabetically: a-cert.pem, cert.crt, m-cert.pem, z-cert.pem
        expect(path.basename(assets[0].source)).toBe('a-cert.pem');
        expect(path.basename(assets[1].source)).toBe('cert.crt');
        expect(path.basename(assets[2].source)).toBe('m-cert.pem');
        expect(path.basename(assets[3].source)).toBe('z-cert.pem');
      });

      test('should handle multiple certificates on Windows', () => {
        const certDir = path.join(testCertificatesDir, 'mixed-certs');

        const comp = RunnerImageComponent.extraCertificates(certDir, 'test-certs');

        const commands = comp.getCommands(Os.WINDOWS, Architecture.X86_64);
        // Should have import commands for all 4 certificates
        expect(commands.filter(c => c.includes('Import-Certificate'))).toHaveLength(4);
        expect(commands).toContain('Import-Certificate -FilePath C:\\test-certs-0.crt -CertStoreLocation Cert:\\LocalMachine\\Root');
      });
    });

    describe('name sanitization', () => {
      test('should sanitize special characters in name', () => {
        const certFile = path.join(testCertificatesDir, 'single-cert.pem');

        const comp = RunnerImageComponent.extraCertificates(certFile, 'test@cert#name!with$special%chars');

        expect(comp.name).toBe('Extra-Certificates-test-cert-name-with-special-chars');

        const assets = comp.getAssets(Os.LINUX_UBUNTU, Architecture.X86_64);
        expect(assets[0].target).toBe('/usr/local/share/ca-certificates/test-cert-name-with-special-chars-0.crt');
      });

      test('should preserve valid characters', () => {
        const certFile = path.join(testCertificatesDir, 'single-cert.pem');

        const comp = RunnerImageComponent.extraCertificates(certFile, 'test-cert_123');

        expect(comp.name).toBe('Extra-Certificates-test-cert_123');
      });
    });

    describe('error handling', () => {
      test('should throw error if directory has no certificate files', () => {
        const emptyDir = path.join(testCertificatesDir, 'empty-dir');

        expect(() => {
          RunnerImageComponent.extraCertificates(emptyDir, 'test-certs');
        }).toThrow(/No certificate files \(\.pem or \.crt\) found in directory/);
      });

      test('should throw error if path does not exist', () => {
        const nonExistentPath = path.join(__dirname, 'certificates', 'does-not-exist');

        expect(() => {
          RunnerImageComponent.extraCertificates(nonExistentPath, 'test-certs');
        }).toThrow(/Certificate source path does not exist/);
      });
    });

    describe('OS-specific behavior', () => {
      test('should use correct commands for Ubuntu', () => {
        const certFile = path.join(testCertificatesDir, 'single-cert.pem');

        const comp = RunnerImageComponent.extraCertificates(certFile, 'test-cert');

        const commands = comp.getCommands(Os.LINUX_UBUNTU, Architecture.X86_64);
        expect(commands).toEqual(['update-ca-certificates']);
      });

      test('should use correct commands for Amazon Linux', () => {
        const certFile = path.join(testCertificatesDir, 'single-cert.pem');

        const comp = RunnerImageComponent.extraCertificates(certFile, 'test-cert');

        const commands = comp.getCommands(Os.LINUX_AMAZON_2023, Architecture.X86_64);
        expect(commands).toEqual(['update-ca-trust']);
      });
    });
  });

  describe('GitHubRunners.extraCertificates', () => {
    let app: cdk.App;
    let stack: cdk.Stack;

    beforeEach(() => {
      app = new cdk.App();
      stack = new cdk.Stack(app, 'test');
    });

    test('should create Lambda layer with single certificate file', () => {
      const certFile = path.join(testCertificatesDir, 'single-cert.pem');

      new GitHubRunners(stack, 'runners', {
        providers: [new LambdaRunnerProvider(stack, 'lambda')],
        extraCertificates: certFile,
      });

      const template = Template.fromStack(stack);

      // Should have a Lambda layer
      template.resourceCountIs('AWS::Lambda::LayerVersion', 1);
      template.hasResourceProperties('AWS::Lambda::LayerVersion', {
        Description: 'Layer containing GitHub Enterprise Server certificate(s) for cdk-github-runners',
      });
    });

    test('should create Lambda layer with directory of certificates', () => {
      const certDir = path.join(testCertificatesDir, 'mixed-certs');

      new GitHubRunners(stack, 'runners', {
        providers: [new LambdaRunnerProvider(stack, 'lambda')],
        extraCertificates: certDir,
      });

      const template = Template.fromStack(stack);

      // Should have a Lambda layer
      template.resourceCountIs('AWS::Lambda::LayerVersion', 1);
      template.hasResourceProperties('AWS::Lambda::LayerVersion', {
        Description: 'Layer containing GitHub Enterprise Server certificate(s) for cdk-github-runners',
      });
    });

    test('should set NODE_EXTRA_CA_CERTS environment variable on Lambda functions', () => {
      const certFile = path.join(testCertificatesDir, 'single-cert.pem');

      new GitHubRunners(stack, 'runners', {
        providers: [new LambdaRunnerProvider(stack, 'lambda')],
        extraCertificates: certFile,
      });

      const template = Template.fromStack(stack);

      // Check that Lambda functions have the environment variable set
      template.hasResourceProperties('AWS::Lambda::Function', {
        Environment: {
          Variables: Match.objectLike({
            NODE_EXTRA_CA_CERTS: '/opt/certs.pem',
          }),
        },
      });
    });

    test('should not create layer when extraCertificates is not provided', () => {
      new GitHubRunners(stack, 'runners', {
        providers: [new LambdaRunnerProvider(stack, 'lambda')],
      });

      const template = Template.fromStack(stack);

      // Should not have a certificate layer
      template.resourceCountIs('AWS::Lambda::LayerVersion', 0);
    });

    test('should throw error if certificate path does not exist', () => {
      const nonExistentPath = path.join(testCertificatesDir, 'does-not-exist');

      expect(() => {
        new GitHubRunners(stack, 'runners', {
          providers: [new LambdaRunnerProvider(stack, 'lambda')],
          extraCertificates: nonExistentPath,
        });
      }).toThrow(/Certificate source path does not exist/);
    });

    test('should throw error if directory has no certificate files', () => {
      const emptyDir = path.join(testCertificatesDir, 'empty-dir');

      expect(() => {
        new GitHubRunners(stack, 'runners', {
          providers: [new LambdaRunnerProvider(stack, 'lambda')],
          extraCertificates: emptyDir,
        });
      }).toThrow(/No certificate files \(\.pem or \.crt\) found in directory/);
    });
  });
});
