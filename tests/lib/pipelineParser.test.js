import { describe, it, expect } from 'vitest';
import {
  parsePipeline,
  parsePipelineLogs,
  mergeTargets,
  TARGET_TYPE_META,
} from '../../src/lib/pipelineParser.js';

describe('pipelineParser', () => {
  describe('parsePipeline', () => {
    it('should return empty array for invalid input', () => {
      expect(parsePipeline(null)).toEqual([]);
      expect(parsePipeline('')).toEqual([]);
      expect(parsePipeline('not yaml')).toEqual([]);
    });

    it('should detect AzureWebApp task', () => {
      const yaml = `
        jobs:
          - job: Deploy
            steps:
              - task: AzureWebApp@1
                inputs:
                  appName: myapp
                  resourceGroupName: myrg
      `;
      const targets = parsePipeline(yaml);
      expect(targets).toHaveLength(1);
      expect(targets[0].type).toBe('webapp');
      expect(targets[0].name).toBe('myapp');
      expect(targets[0].resourceGroup).toBe('myrg');
    });

    it('should detect AzureFunctionApp task', () => {
      const yaml = `
        steps:
          - task: AzureFunctionApp@2
            inputs:
              appName: myfunc
              resourceGroupName: myrg
      `;
      const targets = parsePipeline(yaml);
      expect(targets[0].type).toBe('functionapp');
      expect(targets[0].name).toBe('myfunc');
    });

    it('should detect AzureKubernetesService task', () => {
      const yaml = `
        steps:
          - task: AzureKubernetesService@1
            inputs:
              connectedServiceName: aks-conn
              namespace: production
      `;
      const targets = parsePipeline(yaml);
      expect(targets[0].type).toBe('aks');
      expect(targets[0].namespace).toBe('production');
    });

    it('should detect AzureContainerInstances task', () => {
      const yaml = `
        steps:
          - task: AzureContainerInstances@1
            inputs:
              ContainerGroupName: mycontainer
              resourceGroupName: myrg
      `;
      const targets = parsePipeline(yaml);
      expect(targets[0].type).toBe('aci');
      expect(targets[0].name).toBe('mycontainer');
    });

    it('should detect AzureRMWebAppDeployment task', () => {
      const yaml = `
        steps:
          - task: AzureRMWebAppDeployment@3
            inputs:
              WebAppName: mywebapp
      `;
      const targets = parsePipeline(yaml);
      expect(targets[0].type).toBe('webapp');
    });

    it('should detect CLI scripts with az webapp', () => {
      const yaml = `
        steps:
          - task: AzureCLI@2
            inputs:
              script: az webapp up --name myapp --resource-group myrg
      `;
      const targets = parsePipeline(yaml);
      expect(targets).toHaveLength(1);
      expect(targets[0].type).toBe('webapp');
      expect(targets[0].name).toBe('myapp');
      expect(targets[0].resourceGroup).toBe('myrg');
    });

    it('should handle stages structure', () => {
      const yaml = `
        stages:
          - stage: Build
            jobs:
              - job: BuildJob
                steps:
                  - task: AzureWebApp@1
                    inputs:
                      appName: app1
      `;
      const targets = parsePipeline(yaml);
      expect(targets).toHaveLength(1);
      expect(targets[0].name).toBe('app1');
    });

    it('should handle deployment strategy', () => {
      const yaml = `
        jobs:
          - deployment: Deploy
            strategy:
              runOnce:
                deploy:
                  steps:
                    - task: AzureWebApp@1
                      inputs:
                        appName: prodapp
      `;
      const targets = parsePipeline(yaml);
      expect(targets).toHaveLength(1);
    });

    it('should detect bash scripts with az commands', () => {
      const yaml = `
        steps:
          - bash: az aks get-credentials --name myaks --resource-group myrg
      `;
      const targets = parsePipeline(yaml);
      expect(targets[0].type).toBe('aks');
    });
  });

  describe('parsePipelineLogs', () => {
    it('should return empty array for invalid input', () => {
      expect(parsePipelineLogs(null)).toEqual([]);
      expect(parsePipelineLogs('')).toEqual([]);
    });

    it('should detect webapp deployment from log', () => {
      const log = `
Starting web app deployment...
az webapp up --name myapp --resource-group myrg
Deployment completed.
      `;
      const targets = parsePipelineLogs(log);
      expect(targets).toHaveLength(1);
      expect(targets[0].type).toBe('webapp');
      expect(targets[0].name).toBe('myapp');
      expect(targets[0].source).toBe('log');
    });

    it('should detect aks from log', () => {
      const log = `
Running kubectl deployment...
az aks get-credentials --name mycluster --resource-group myrg
      `;
      const targets = parsePipelineLogs(log);
      expect(targets[0].type).toBe('aks');
    });

    it('should not duplicate targets on same line', () => {
      const log = 'az webapp up --name app --resource-group rg';
      const targets = parsePipelineLogs(log);
      expect(targets).toHaveLength(1);
    });

    it('should handle multiple targets in log', () => {
      const log = `
az webapp up --name app1 --resource-group rg1
az aks get-credentials --name cluster2 --resource-group rg2
      `;
      const targets = parsePipelineLogs(log);
      expect(targets).toHaveLength(2);
    });
  });

  describe('mergeTargets', () => {
    it('should merge yaml and log targets by key', () => {
      const yamlTargets = [
        { type: 'webapp', name: 'myapp', resourceGroup: 'rg1', source: 'yaml' },
      ];
      const logTargets = [
        { type: 'webapp', name: 'myapp', resourceGroup: 'rg1', source: 'log' },
      ];

      const merged = mergeTargets(yamlTargets, logTargets);
      expect(merged).toHaveLength(1);
      expect(merged[0].source).toBe('both');
    });

    it('should deduplicate identical targets', () => {
      const targets = [
        { type: 'webapp', name: 'app1', resourceGroup: 'rg1' },
        { type: 'webapp', name: 'app1', resourceGroup: 'rg1' },
      ];
      const merged = mergeTargets(targets, []);
      expect(merged).toHaveLength(1);
    });

    it('should combine all unique keys', () => {
      const yamlTargets = [
        { type: 'webapp', name: 'app1', resourceGroup: 'rg1' },
        { type: 'aks', name: 'cluster1', resourceGroup: 'rg2' },
      ];
      const logTargets = [
        { type: 'functionapp', name: 'func1', resourceGroup: 'rg3' },
      ];

      const merged = mergeTargets(yamlTargets, logTargets);
      expect(merged).toHaveLength(3);
    });

    it('should handle case insensitive name/rg matching', () => {
      const yamlTargets = [
        { type: 'webapp', name: 'MyApp', resourceGroup: 'MyRG' },
      ];
      const logTargets = [
        { type: 'webapp', name: 'myapp', resourceGroup: 'myrg' },
      ];

      const merged = mergeTargets(yamlTargets, logTargets);
      expect(merged).toHaveLength(1);
    });
  });

  describe('TARGET_TYPE_META', () => {
    it('should have correct labels', () => {
      expect(TARGET_TYPE_META.webapp.label).toBe('Web App');
      expect(TARGET_TYPE_META.functionapp.label).toBe('Function App');
      expect(TARGET_TYPE_META.aks.label).toBe('Kubernetes Service');
    });
  });
});