//-- copyright
// OpenProject is an open source project management software.
// Copyright (C) the OpenProject GmbH
//
// This program is free software; you can redistribute it and/or
// modify it under the terms of the GNU General Public License version 3.
//
// OpenProject is a fork of ChiliProject, which is a fork of Redmine. The copyright follows:
// Copyright (C) 2006-2013 Jean-Philippe Lang
// Copyright (C) 2010-2013 the ChiliProject Team
//
// This program is free software; you can redistribute it and/or
// modify it under the terms of the GNU General Public License
// as published by the Free Software Foundation; either version 2
// of the License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
// See COPYRIGHT and LICENSE files for more details.
//++

import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnChanges, SimpleChanges, inject } from '@angular/core';
import { I18nService } from 'core-app/core/i18n/i18n.service';
import { WorkPackageResource } from 'core-app/features/hal/resources/work-package-resource';
import { PathHelperService } from 'core-app/core/path-helper/path-helper.service';
import { Subscription, map, switchMap } from 'rxjs';
import { UntilDestroyedMixin } from 'core-app/shared/helpers/angular/until-destroyed.mixin';
import { ApiV3Service } from 'core-app/core/apiv3/api-v3.service';
import {
  WorkPackageIsolatedQuerySpaceDirective,
} from 'core-app/features/work-packages/directives/query-space/wp-isolated-query-space.directive';
import { SchemaCacheService, fallbackSchemaId } from 'core-app/core/schemas/schema-cache.service';

@Component({
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'wp-relations-hierarchy',
  templateUrl: './wp-relations-hierarchy.template.html',
  hostDirectives: [WorkPackageIsolatedQuerySpaceDirective],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class WorkPackageRelationsHierarchyComponent extends UntilDestroyedMixin implements OnChanges {
  readonly apiV3Service = inject(ApiV3Service);
  readonly PathHelper = inject(PathHelperService);
  readonly I18n = inject(I18nService);
  readonly schemaCache = inject(SchemaCacheService);
  readonly cdRef = inject(ChangeDetectorRef);

  private workPackageSubscription?:Subscription;

  @Input() public workPackage:WorkPackageResource;

  @Input() public relationType:string;

  public showEditForm = false;

  public workPackagePath:string;

  public canHaveChildren = false;

  public canModifyHierarchy:boolean;

  public canAddRelation:boolean;

  public childrenQueryProps:{ filters:string, 'columns[]':string[], showHierarchies:boolean };

  public text = {
    parentHeadline: this.I18n.t('js.relations_hierarchy.parent_headline'),
    childrenHeadline: this.I18n.t('js.relations_hierarchy.children_headline'),
  };

  ngOnChanges(changes:SimpleChanges<WorkPackageRelationsHierarchyComponent>):void {
    if (!changes.workPackage) {
      return;
    }

    this.updateWorkPackageDetails();
    if (changes.workPackage.previousValue?.id === this.workPackage.id) {
      return;
    }

    this.canHaveChildren = false;
    this.childrenQueryProps = {
      filters: JSON.stringify([{ parent: { operator: '=', values: [this.workPackage.id] } }]),
      'columns[]': ['id', 'type', 'subject', 'status'],
      showHierarchies: false,
    };

    this.workPackageSubscription?.unsubscribe();
    this.workPackageSubscription = this
      .apiV3Service
      .work_packages
      .id(this.workPackage)
      .requireAndStream()
      .pipe(
        switchMap((wp) => this.schemaCache
          .requireAndStream(this.schemaCache.getSchemaHref(wp) ?? fallbackSchemaId)
          .pipe(map((schema) => ({ wp, schema })))),
        this.untilDestroyed(),
      )
      .subscribe(({ wp, schema }) => {
        this.workPackage = wp;
        this.updateWorkPackageDetails();
        this.canHaveChildren = !this.schemaCache.proxied(wp, schema).isMilestone;
        this.cdRef.markForCheck();
      });
  }

  private updateWorkPackageDetails():void {
    this.workPackagePath = this.PathHelper.workPackagePath(this.workPackage.displayId);
    this.canModifyHierarchy = !!this.workPackage.changeParent;
    this.canAddRelation = !!this.workPackage.addRelation;
  }
}
